import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { pageToast } from '../../core/page-toast';
import { profilePageHandle } from './rules';
import { loadSettings } from './settings';

const host = document.createElement('div');
host.dataset.lifetoolsBlocker = 'button';
const shadow = host.attachShadow({ mode: 'closed' });
const style = document.createElement('style');
style.textContent = ':host{position:fixed;bottom:20px;left:20px;z-index:2147483646}button{font:600 13px system-ui;border:1px solid #88939a;border-radius:20px;padding:7px 12px;background:#fff;color:#17251d;cursor:pointer}button:disabled{opacity:.7;cursor:default}';
const button = document.createElement('button'); button.type = 'button'; shadow.append(style, button);
document.documentElement.append(host);
let current = ''; let serial = 0;
async function render(): Promise<void> {
  const id = ++serial; const handle = profilePageHandle(location.href);
  const [enabled, settings, data] = await Promise.all([isModuleEnabled('site-blocker'), loadSettings(), chrome.storage.local.get({ siteBlockerButtonEnabled: true })]);
  if (id !== serial) return;
  current = handle ?? '';
  host.hidden = !handle || !enabled || !settings.enabled || data.siteBlockerButtonEnabled === false;
  button.disabled = !!handle && settings.blockedHandles.includes(handle);
  button.textContent = button.disabled ? 'Engelli' : 'Engelle';
  const header = document.querySelector<HTMLElement>('[data-testid="primaryColumn"] [data-testid="UserName"]');
  const rect = header?.getBoundingClientRect();
  if (rect && rect.top >= 0 && rect.top < innerHeight) { host.style.left = `${Math.max(8, rect.right - 80)}px`; host.style.top = `${Math.max(8, rect.top)}px`; host.style.bottom = 'auto'; }
  else { host.style.left = '20px'; host.style.top = 'auto'; host.style.bottom = '20px'; }
}
button.addEventListener('click', () => { const handle = current; button.disabled = true; void chrome.runtime.sendMessage({ type: 'site-blocker:add', handle }).then(result => { if (result?.ok) pageToast({ ok: true, title: `@${handle} engellendi`, undoType: 'site-blocker:remove', handle }); else void render(); }).catch(() => { void render(); }); });
let route = location.href;
setInterval(() => { if (route !== location.href) { route = location.href; void render(); } }, 500);
window.addEventListener('popstate', () => { void render(); });
window.addEventListener('scroll', () => { void render(); }, { passive: true });
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[MODULE_FLAGS_KEY] || changes.enabled || changes.blockedHandles || changes.siteBlockerButtonEnabled)) void render(); });
void render();
