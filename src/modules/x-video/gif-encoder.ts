/** GIF karesi en uzun kenarı 480 px olacak şekilde küçültülür (dikey videoda da bellek sınırlı kalsın). */
export const GIF_MAX_SIDE = 480;

export function frameSize(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !(width > 0 && height > 0)) throw new Error('Invalid frame size');
  const scale = Math.min(1, GIF_MAX_SIDE / width, GIF_MAX_SIDE / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Büyüyen bayt tamponu: number[] yerine Uint8Array, böylece her bayt 1 bayt yer tutar. */
class ByteWriter {
  private buf = new Uint8Array(1 << 16);
  private len = 0;
  private ensure(extra: number): void {
    if (this.len + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + extra) size *= 2;
    const next = new Uint8Array(size); next.set(this.buf.subarray(0, this.len)); this.buf = next;
  }
  byte(v: number): void { this.ensure(1); this.buf[this.len++] = v; }
  bytes(values: ArrayLike<number>): void { this.ensure(values.length); for (let i = 0; i < values.length; i++) this.buf[this.len++] = values[i]; }
  word(v: number): void { this.byte(v & 255); this.byte((v >> 8) & 255); }
  result(): Uint8Array { return this.buf.slice(0, this.len); }
}

const MIN_CODE_SIZE = 8;
const CLEAR = 1 << MIN_CODE_SIZE;
const EOI = CLEAR + 1;
const MAX_CODE = 4096;

/** 3-3-2 bit palet: tüm kareler aynı 256 rengi kullanır. */
function paletteIndex(frame: Uint8ClampedArray, p: number): number {
  return (frame[p] & 0xe0) | ((frame[p + 1] & 0xe0) >> 3) | (frame[p + 2] >> 6);
}

/** Bir karenin piksellerini gerçek (sözlüklü, değişken genişlikli) LZW ile 255 baytlık alt bloklar halinde yazar. */
function writeLzw(out: ByteWriter, frame: Uint8ClampedArray): void {
  const block = new Uint8Array(255); let blockLen = 0;
  const flushBlock = () => { if (!blockLen) return; out.byte(blockLen); out.bytes(block.subarray(0, blockLen)); blockLen = 0; };
  const pushByte = (b: number) => { block[blockLen++] = b; if (blockLen === 255) flushBlock(); };
  let bits = 0, count = 0, codeSize = MIN_CODE_SIZE + 1;
  const emit = (code: number) => { bits |= code << count; count += codeSize; while (count >= 8) { pushByte(bits & 255); bits >>>= 8; count -= 8; } };

  let table = new Map<number, number>();
  let next = EOI + 1;
  emit(CLEAR);
  let prefix = paletteIndex(frame, 0);
  for (let p = 4; p < frame.length; p += 4) {
    const k = paletteIndex(frame, p);
    const key = (prefix << 8) | k;
    const found = table.get(key);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix);
    if (next === MAX_CODE) {
      emit(CLEAR);
      table = new Map(); next = EOI + 1; codeSize = MIN_CODE_SIZE + 1;
    } else {
      // Kod genişliği, mevcut genişliğe sığmayan ilk girdi eklenmeden hemen önce artar (çözücüyle aynı an).
      if (next >= (1 << codeSize)) codeSize++;
      table.set(key, next++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(EOI);
  if (count > 0) pushByte(bits & 255);
  flushBlock();
  out.byte(0);
}

export interface GifEncoder {
  addFrame(frame: Uint8ClampedArray): void;
  finish(): Uint8Array;
}

/** Kareleri biriktirmeden akış halinde kodlar; bellekte yalnız çıktı GIF'i tutulur. */
export function createGifEncoder(width: number, height: number, delay = 8): GifEncoder {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535) throw new Error('Invalid GIF frames');
  const out = new ByteWriter();
  out.bytes([71, 73, 70, 56, 57, 97]); out.word(width); out.word(height); out.bytes([0xf7, 0, 0]);
  for (let i = 0; i < 256; i++) out.bytes([Math.round((i >> 5) * 255 / 7), Math.round(((i >> 2) & 7) * 255 / 7), Math.round((i & 3) * 255 / 3)]);
  out.bytes([0x21, 0xff, 11, ...Array.from('NETSCAPE2.0', c => c.charCodeAt(0)), 3, 1, 0, 0, 0]);
  const frameDelay = Math.max(1, Math.min(65535, Math.round(delay)));
  let frames = 0, done = false;
  return {
    addFrame(frame) {
      if (done || frame.length !== width * height * 4) throw new Error('Invalid GIF frames');
      out.bytes([0x21, 0xf9, 4, 0]); out.word(frameDelay); out.bytes([0, 0]);
      out.byte(0x2c); out.word(0); out.word(0); out.word(width); out.word(height); out.bytes([0, MIN_CODE_SIZE]);
      writeLzw(out, frame);
      frames++;
    },
    finish() {
      if (done || !frames) throw new Error('Invalid GIF frames');
      done = true; out.byte(0x3b); return out.result();
    }
  };
}

export function encodeGif(width: number, height: number, frames: Uint8ClampedArray[], delay = 8): Uint8Array {
  if (!frames.length || frames.some(f => f.length !== width * height * 4)) throw new Error('Invalid GIF frames');
  const encoder = createGifEncoder(width, height, delay);
  for (const frame of frames) encoder.addFrame(frame);
  return encoder.finish();
}
