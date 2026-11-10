import { isModuleEnabled } from '../../core/module-state';
import { pageToast } from '../../core/page-toast';
import { profilePageHandle } from './rules';
import { loadSettings } from './settings';

const host = document.createElement('div');
host.dataset.lifetoolsBlocker = 'button';
const shadow = host.attachShadow({ mode: 'closed' });
const style = document.createElement('style');
style.textContent = ':host{position:fixed;bottom:20px;left:20px;z-index:2147483646}button{font:600 13px system-ui;border:1px solid #88939a;border-radius:20px;padding:7px 12px;background:#fff;color:#17251d;cursor:pointer}button:disabled{opacity:.7;cursor:default}';
const button = document.createElement('button'); button.type = 'button'; shadow.append(style, button);
host.hidden = true;
document.documentElement.append(host);
let current = ''; let serial = 0; let frame = 0; let refreshQueued = false;
let state: { enabled: boolean; settings: Awaited<ReturnType<typeof loadSettings>>; buttonEnabled: boolean } | undefined;
async function refreshState(): Promise<void> {
  const id = ++serial;
  const [enabled, settings, data] = await Promise.all([isModuleEnabled('site-blocker'), loadSettings(), chrome.storage.local.get({ siteBlockerButtonEnabled: true })]);
  if (id !== serial) return;
  state = { enabled, settings, buttonEnabled: data.siteBlockerButtonEnabled !== false };
  update();
}
let route = location.href;
let routeTimer: ReturnType<typeof setInterval> | undefined;
function syncWatcher(): void {
  const active = !!state && state.enabled && state.settings.enabled && state.buttonEnabled;
  if (active && routeTimer === undefined) routeTimer = setInterval(() => { if (route !== location.href) { route = location.href; update(); } }, 500);
  else if (!active && routeTimer !== undefined) { clearInterval(routeTimer); routeTimer = undefined; }
}
function update(): void {
  syncWatcher();
  const handle = profilePageHandle(location.href);
  current = handle ?? '';
  host.hidden = !handle || !state || !state.enabled || !state.settings.enabled || !state.buttonEnabled;
  button.disabled = !!handle && !!state?.settings.blockedHandles.includes(handle);
  button.textContent = button.disabled ? 'Engelli' : 'Engelle';
  if (!host.hidden) position();
}
function position(): void {
  if (host.hidden) return;
  const header = document.querySelector<HTMLElement>('[data-testid="primaryColumn"] [data-testid="UserName"]');
  const rect = header?.getBoundingClientRect();
  if (rect && rect.top >= 0 && rect.top < innerHeight) { host.style.left = `${Math.max(8, rect.right - 80)}px`; host.style.top = `${Math.max(8, rect.top)}px`; host.style.bottom = 'auto'; }
  else { host.style.left = '20px'; host.style.top = 'auto'; host.style.bottom = '20px'; }
}
button.addEventListener('click', () => { const handle = current; button.disabled = true; void chrome.runtime.sendMessage({ type: 'site-blocker:add', handle }).then(result => { if (result?.ok) pageToast({ ok: true, title: `@${handle} engellendi`, undoType: 'site-blocker:remove', handle }); else update(); }).catch(() => { update(); }); });
window.addEventListener('popstate', () => { route = location.href; update(); });
window.addEventListener('scroll', () => { if (!host.hidden && !frame) frame = requestAnimationFrame(() => { frame = 0; position(); }); }, { passive: true });
chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local' && !refreshQueued) { refreshQueued = true; queueMicrotask(() => { refreshQueued = false; void refreshState(); }); } });
void refreshState();
