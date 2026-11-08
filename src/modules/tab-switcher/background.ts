import { isModuleEnabled } from '../../core/module-state';
import { MRU_KEY } from './filter';
export const TAB_SWITCHER_ID = 'tab-switcher';
let queue = Promise.resolve();
export function initTabSwitcherBackground(): void {
 chrome.tabs.onActivated.addListener(({ tabId }) => { queue = queue.then(async () => {
  if (!(await isModuleEnabled(TAB_SWITCHER_ID))) return;
  const data = await chrome.storage.session.get({ [MRU_KEY]: [] });
  const ids = Array.isArray(data[MRU_KEY]) ? (data[MRU_KEY] as unknown[]).filter((id): id is number => typeof id === 'number' && id !== tabId) : [];
  await chrome.storage.session.set({ [MRU_KEY]: [tabId, ...ids].slice(0, 200) });
 }).catch(error => console.debug('[Sekme Değiştirici]', error)); });
 chrome.commands.onCommand.addListener(command => { if (command === 'open-switcher') void (async () => { if (await isModuleEnabled(TAB_SWITCHER_ID)) await chrome.tabs.create({ url: chrome.runtime.getURL('switcher.html') }); })(); });
}
