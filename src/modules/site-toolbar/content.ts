/** Site araç çubuğu: kapalı Shadow DOM içinde, sürüklenebilir, varsayılan olarak küçültülmüş. Hiçbir eylem kendiliğinden çalışmaz. */
interface Config { actions: { id: string; title: string }[]; x?: number; y?: number }
interface Result { ok?: boolean; message?: string }

const TOOLBAR_CSS = `
:host { all: initial; }
.wrap { position: fixed; z-index: 2147483647; font: 13px/1.3 system-ui, sans-serif; color: #172033; }
.fab { all: unset; box-sizing: border-box; width: 36px; height: 36px; border-radius: 50%; background: #4d63dd; color: #fff; font-weight: 700; font-size: 12px; display: flex; align-items: center; justify-content: center; cursor: grab; box-shadow: 0 2px 8px rgba(0,0,0,.3); user-select: none; touch-action: none; }
.fab:focus-visible, button.act:focus-visible { outline: 2px solid #172033; outline-offset: 2px; }
.panel { position: absolute; bottom: 42px; right: 0; min-width: 200px; max-width: 260px; background: #fff; border: 1px solid #aab5c6; border-radius: 10px; padding: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.25); display: flex; flex-direction: column; gap: 4px; }
.panel[hidden] { display: none; }
.wrap.top .panel { bottom: auto; top: 42px; }
.wrap.left .panel { right: auto; left: 0; }
button.act { all: unset; box-sizing: border-box; padding: 7px 9px; border-radius: 6px; cursor: pointer; background: #f3f5f9; color: #172033; }
button.act:hover { background: #e5e9ff; }
button.act[disabled] { opacity: .6; cursor: default; }
.status { padding: 2px 4px; color: #5d6b7b; min-height: 1em; }
`;

let host: HTMLElement | null = null;
let shownIds = '';

function send<T>(message: Record<string, unknown>): Promise<T | null> {
  return (chrome.runtime.sendMessage({ channel: 'site-toolbar', ...message }) as Promise<T | null>).catch(() => null);
}

function destroy(): void { host?.remove(); host = null; shownIds = ''; }

function build(config: Config): void {
  destroy();
  shownIds = config.actions.map(a => a.id).join('|');
  host = document.createElement('div');
  const root = host.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(TOOLBAR_CSS);
  root.adoptedStyleSheets = [sheet];

  const wrap = document.createElement('div'); wrap.className = 'wrap';
  const panel = document.createElement('div'); panel.className = 'panel'; panel.hidden = true; panel.setAttribute('role', 'menu');
  const status = document.createElement('div'); status.className = 'status'; status.setAttribute('aria-live', 'polite');
  const fab = document.createElement('button'); fab.className = 'fab'; fab.type = 'button'; fab.textContent = 'LT';
  fab.title = 'LifeTools araç çubuğu (sürükleyebilirsin)'; fab.setAttribute('aria-label', 'LifeTools araç çubuğunu aç veya kapat'); fab.setAttribute('aria-expanded', 'false');

  for (const action of config.actions) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'act'; button.textContent = action.title; button.setAttribute('role', 'menuitem');
    button.addEventListener('click', () => {
      button.disabled = true; status.textContent = '…';
      void send<Result>({ action: 'run', id: action.id }).then(res => {
        status.textContent = res?.ok ? (res.message || 'Tamam ✓') : (res?.message || 'İşlem başarısız.');
      }).finally(() => { button.disabled = false; });
    });
    panel.append(button);
  }
  panel.append(status);
  wrap.append(panel, fab);
  root.append(wrap);

  let x = typeof config.x === 'number' ? config.x : 1, y = typeof config.y === 'number' ? config.y : 0.8;
  const place = (): void => {
    const w = 36, h = 36;
    wrap.style.left = `${Math.round(x * Math.max(0, window.innerWidth - w))}px`;
    wrap.style.top = `${Math.round(y * Math.max(0, window.innerHeight - h))}px`;
    wrap.classList.toggle('top', y < 0.5); wrap.classList.toggle('left', x < 0.5);
  };
  place();
  window.addEventListener('resize', place);

  const setOpen = (open: boolean): void => { panel.hidden = !open; fab.setAttribute('aria-expanded', String(open)); if (!open) status.textContent = ''; };
  let drag: { px: number; py: number; moved: boolean } | null = null;
  fab.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    drag = { px: event.clientX, py: event.clientY, moved: false };
    fab.setPointerCapture(event.pointerId); fab.style.cursor = 'grabbing';
  });
  fab.addEventListener('pointermove', event => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.px, event.clientY - drag.py) < 4) return;
    drag.moved = true;
    const w = 36, h = 36;
    x = Math.max(0, Math.min(1, (event.clientX - w / 2) / Math.max(1, window.innerWidth - w)));
    y = Math.max(0, Math.min(1, (event.clientY - h / 2) / Math.max(1, window.innerHeight - h)));
    place();
  });
  const endDrag = (): void => {
    if (!drag) return;
    const moved = drag.moved; drag = null; fab.style.cursor = 'grab';
    if (moved) void send({ action: 'move', x, y }); else setOpen(panel.hidden);
  };
  fab.addEventListener('pointerup', endDrag);
  // Klavye (Enter/Space) ile açma: fare tıklamalarında pointerup zaten işler.
  fab.addEventListener('click', event => { if (event.detail === 0) setOpen(panel.hidden); });
  fab.addEventListener('pointercancel', () => { drag = null; fab.style.cursor = 'grab'; });
  fab.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { setOpen(false); fab.focus(); } });

  document.documentElement.append(host);
}

async function load(): Promise<void> {
  const config = await send<Config>({ action: 'get' });
  if (!config || !Array.isArray(config.actions) || !config.actions.length) { destroy(); return; }
  // Yalnızca konum değiştiyse çubuğu yeniden kurma (açık/kapalı durumu korunsun).
  if (host && config.actions.map(a => a.id).join('|') === shownIds) return;
  build(config);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.siteToolbarSites || changes.moduleEnabled)) void load();
});
void load();
