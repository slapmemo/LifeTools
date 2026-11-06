import { isModuleEnabled } from '../../core/module-state';
export const TAB_SWITCHER_ID = 'tab-switcher';
export function initTabSwitcherBackground(): void { chrome.commands.onCommand.addListener(command => { if (command === 'open-switcher') void (async () => { if (await isModuleEnabled(TAB_SWITCHER_ID)) await chrome.tabs.create({ url: chrome.runtime.getURL('switcher.html') }); })(); }); }
