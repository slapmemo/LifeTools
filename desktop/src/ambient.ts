// Ortam sesi motoru: tüm sesler Web Audio ile sentezlenir (ses dosyası yok).
// Döngülü tamponlar kullanıldığından zamanlayıcıya bağlı değildir; pencere tepsiye gizlenince de çalar.

export const CHANNEL_IDS = ['white', 'pink', 'brown', 'rain', 'fan', 'wave'] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

export const CHANNEL_LABELS: Record<ChannelId, string> = {
  white: 'Beyaz gürültü',
  pink: 'Pembe gürültü',
  brown: 'Kahverengi gürültü',
  rain: 'Yağmur',
  fan: 'Fan',
  wave: 'Dalga'
};

export interface ChannelCfg {
  on: boolean;
  vol: number;
}

export interface AmbientConfig {
  master: number;
  channels: Record<ChannelId, ChannelCfg>;
}

export function defaultConfig(): AmbientConfig {
  const channels = {} as Record<ChannelId, ChannelCfg>;
  for (const id of CHANNEL_IDS) channels[id] = { on: false, vol: 0.5 };
  return { master: 0.8, channels };
}

const clamp01 = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

/** Dışarıdan gelen (kayıtlı) değeri güvenle varsayılanlarla birleştirir. */
export function mergeConfig(base: AmbientConfig, raw: unknown): AmbientConfig {
  const out: AmbientConfig = {
    master: base.master,
    channels: Object.fromEntries(CHANNEL_IDS.map((id) => [id, { ...base.channels[id] }])) as Record<ChannelId, ChannelCfg>
  };
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as { master?: unknown; channels?: Record<string, { on?: unknown; vol?: unknown } | undefined> };
  out.master = clamp01(r.master, out.master);
  for (const id of CHANNEL_IDS) {
    const c = r.channels?.[id];
    if (c && typeof c === 'object') {
      out.channels[id] = { on: c.on === true, vol: clamp01(c.vol, out.channels[id].vol) };
    }
  }
  return out;
}

export function parseConfig(json: string | null): AmbientConfig {
  if (!json) return defaultConfig();
  try {
    return mergeConfig(defaultConfig(), JSON.parse(json));
  } catch {
    return defaultConfig();
  }
}

type BufKind = 'white' | 'pink' | 'brown' | 'drops';

function makeLoop(ctx: AudioContext, seconds: number, fill: (d: Float32Array) => void): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.floor(seconds * rate);
  const x = Math.floor(rate * 0.5);
  const raw = new Float32Array(n + x);
  fill(raw);
  const buf = ctx.createBuffer(1, n, rate);
  const d = buf.getChannelData(0);
  d.set(raw.subarray(0, n));
  // Döngü dikişini eşit güçle çapraz geçişle gizle.
  for (let i = 0; i < x; i++) {
    const t = (i / x) * (Math.PI / 2);
    d[i] = raw[i] * Math.sin(t) + raw[n + i] * Math.cos(t);
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0) for (let i = 0; i < n; i++) d[i] *= 0.8 / peak;
  return buf;
}

function fillWhite(d: Float32Array): void {
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function fillPink(d: Float32Array): void {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
}

function fillBrown(d: Float32Array): void {
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
}

/** Seyrek, kısa, üstel sönümlü gürültü patlamaları = yağmur damlaları. */
function fillDrops(d: Float32Array, rate: number): void {
  const count = Math.floor((d.length / rate) * 45);
  for (let k = 0; k < count; k++) {
    const len = Math.floor(rate * (0.004 + Math.random() * 0.016));
    const pos = Math.floor(Math.random() * Math.max(1, d.length - len));
    const amp = 0.2 + Math.random() ** 2 * 0.8;
    for (let j = 0; j < len; j++) d[pos + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / (len * 0.25));
  }
}

export class AmbientEngine {
  config: AmbientConfig = defaultConfig();
  playing = false;
  timerMin: number | null = null;
  onChange: () => void = () => undefined;
  onBlocked: () => void = () => undefined;

  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private fade!: GainNode;
  private bufs = new Map<BufKind, AudioBuffer>();
  private chGain = new Map<ChannelId, GainNode>();
  private running = new Map<ChannelId, () => void>();
  private timerId: number | undefined;
  private suspendId: number | undefined;
  private endsAt = 0;

  private init(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    this.master = ctx.createGain();
    this.fade = ctx.createGain();
    this.master.connect(this.fade).connect(ctx.destination);
    for (const id of CHANNEL_IDS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      this.chGain.set(id, g);
    }
    this.ctx = ctx;
    return ctx;
  }

  private buf(kind: BufKind): AudioBuffer {
    let b = this.bufs.get(kind);
    if (!b) {
      const ctx = this.ctx!;
      const fills: Record<BufKind, (d: Float32Array) => void> = {
        white: fillWhite,
        pink: fillPink,
        brown: fillBrown,
        drops: (d) => fillDrops(d, ctx.sampleRate)
      };
      b = makeLoop(ctx, kind === 'drops' ? 12 : 8, fills[kind]);
      this.bufs.set(kind, b);
    }
    return b;
  }

  private build(id: ChannelId, out: GainNode): () => void {
    const ctx = this.ctx!;
    const nodes: AudioNode[] = [];
    const add = <T extends AudioNode>(n: T): T => {
      nodes.push(n);
      return n;
    };
    const noise = (kind: BufKind): AudioBufferSourceNode => {
      const s = add(ctx.createBufferSource());
      const b = this.buf(kind);
      s.buffer = b;
      s.loop = true;
      s.start(0, Math.random() * b.duration);
      return s;
    };
    const filter = (type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode => {
      const f = add(ctx.createBiquadFilter());
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      return f;
    };
    const gain = (v: number): GainNode => {
      const g = add(ctx.createGain());
      g.gain.value = v;
      return g;
    };
    const osc = (freq: number): OscillatorNode => {
      const o = add(ctx.createOscillator());
      o.type = 'sine';
      o.frequency.value = freq;
      o.start();
      return o;
    };

    switch (id) {
      case 'white':
        noise('white').connect(gain(0.35)).connect(out);
        break;
      case 'pink':
        noise('pink').connect(gain(0.6)).connect(out);
        break;
      case 'brown':
        noise('brown').connect(gain(0.9)).connect(out);
        break;
      case 'rain':
        noise('white').connect(filter('highpass', 800)).connect(filter('lowpass', 9000)).connect(gain(0.22)).connect(out);
        noise('drops').connect(filter('bandpass', 3500, 0.7)).connect(gain(0.9)).connect(out);
        break;
      case 'fan': {
        const body = gain(1.1);
        noise('brown').connect(filter('lowpass', 500)).connect(body).connect(out);
        osc(0.4).connect(gain(0.15)).connect(body.gain); // hafif salınım
        osc(100).connect(gain(0.02)).connect(out); // hafif uğultu
        osc(200).connect(gain(0.01)).connect(out);
        break;
      }
      case 'wave': {
        const lp = filter('lowpass', 650);
        const swell = gain(0.55);
        noise('brown').connect(lp).connect(swell).connect(out);
        const hiss = gain(0.08);
        noise('white').connect(filter('highpass', 1500)).connect(hiss).connect(out);
        const lfo = osc(0.09);
        lfo.connect(gain(450)).connect(lp.frequency);
        lfo.connect(gain(0.4)).connect(swell.gain);
        lfo.connect(gain(0.07)).connect(hiss.gain);
        break;
      }
    }
    return () => {
      for (const n of nodes) {
        try {
          (n as AudioScheduledSourceNode).stop?.();
        } catch {
          /* zaten durmuş */
        }
        try {
          n.disconnect();
        } catch {
          /* zaten ayrılmış */
        }
      }
    };
  }

  /** Yapılandırmayı çalan sese uygular. */
  apply(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.master.gain.setTargetAtTime(this.config.master ** 2, now, 0.05);
    for (const id of CHANNEL_IDS) {
      const cfg = this.config.channels[id];
      const g = this.chGain.get(id)!;
      if (this.playing && cfg.on) {
        if (!this.running.has(id)) this.running.set(id, this.build(id, g));
        g.gain.setTargetAtTime(cfg.vol ** 2, now, 0.05);
      } else {
        const stop = this.running.get(id);
        if (stop) {
          this.running.delete(id);
          g.gain.setTargetAtTime(0, now, 0.05);
          window.setTimeout(stop, 500);
        }
      }
    }
  }

  async play(): Promise<void> {
    const ctx = this.init();
    window.clearTimeout(this.suspendId);
    const now = ctx.currentTime;
    this.fade.gain.cancelScheduledValues(now);
    this.fade.gain.setValueAtTime(1, now);
    this.playing = true;
    this.apply();
    this.scheduleTimer();
    this.onChange();
    await Promise.race([ctx.resume().catch(() => undefined), new Promise((r) => window.setTimeout(r, 400))]);
    if (this.playing && ctx.state !== 'running') this.onBlocked();
  }

  stop(): void {
    this.playing = false;
    window.clearTimeout(this.timerId);
    this.timerId = undefined;
    const ctx = this.ctx;
    if (ctx) {
      const now = ctx.currentTime;
      this.fade.gain.cancelScheduledValues(now);
      this.fade.gain.setTargetAtTime(0, now, 0.08);
      this.apply();
      window.clearTimeout(this.suspendId);
      this.suspendId = window.setTimeout(() => {
        if (!this.playing) void ctx.suspend();
      }, 800);
    }
    this.onChange();
  }

  /** Kullanıcı etkileşiminden sonra askıdaki bağlamı sürdür. */
  kick(): void {
    if (this.playing && this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
  }

  setTimer(min: number | null): void {
    this.timerMin = min;
    if (this.playing) this.scheduleTimer();
    this.onChange();
  }

  private scheduleTimer(): void {
    window.clearTimeout(this.timerId);
    this.timerId = undefined;
    this.endsAt = 0;
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.fade.gain.cancelScheduledValues(now);
    this.fade.gain.setValueAtTime(1, now);
    if (this.timerMin === null) return;
    const sec = this.timerMin * 60;
    this.endsAt = Date.now() + sec * 1000;
    // Gizli pencerede zamanlayıcılar kısılabilir; kapanış sesin kendi saatinde de planlanır.
    this.fade.gain.setValueAtTime(1, now + Math.max(0, sec - 4));
    this.fade.gain.linearRampToValueAtTime(0, now + sec);
    this.timerId = window.setTimeout(() => this.stop(), sec * 1000);
  }

  /** Kapanışa kalan saniye (zamanlayıcı yoksa null). */
  remaining(): number | null {
    if (!this.playing || this.endsAt === 0) return null;
    return Math.max(0, Math.round((this.endsAt - Date.now()) / 1000));
  }
}

export const ambient = new AmbientEngine();

for (const ev of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(ev, () => ambient.kick(), true);
}
