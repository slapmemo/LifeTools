import { ALLOW_KEY, normalizeHandle, safeOriginalUrl } from './rules';
import { loadSettings } from './settings';

const params = new URLSearchParams(location.search);
const handle = normalizeHandle(params.get('handle'));
const url = params.get('url') ?? '';
const valid = !!handle && safeOriginalUrl(url, handle);
const back = document.querySelector<HTMLButtonElement>('#back')!;
const allow = document.querySelector<HTMLButtonElement>('#allow')!;
const remove = document.querySelector<HTMLButtonElement>('#remove')!;
if (handle) document.querySelector('#title')!.textContent = `@${handle} engellendi`;
allow.disabled = remove.disabled = !valid;
back.addEventListener('click', () => { if (history.length > 1) history.back(); else void chrome.tabs.getCurrent().then(tab => { if (tab?.id !== undefined) return chrome.tabs.remove(tab.id); }); });
allow.addEventListener('click', () => { if (!valid || !handle) return; void (async () => { const data = await chrome.storage.session.get({ [ALLOW_KEY]: {} }); await chrome.storage.session.set({ [ALLOW_KEY]: { ...data[ALLOW_KEY], [handle]: Date.now() + 300000 } }); location.assign(url); })(); });
remove.addEventListener('click', () => { if (!valid || !handle) return; void (async () => { const settings = await loadSettings(); await chrome.storage.local.set({ blockedHandles: settings.blockedHandles.filter(item => item !== handle) }); location.assign(url); })(); });
