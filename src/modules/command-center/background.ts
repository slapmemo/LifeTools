import { isModuleEnabled } from '../../core/module-state';
import { getTargetTab } from '../../core/action-runtime';

export const COMMAND_CENTER_ID = 'command-center';
export const COMMAND_CENTER_TARGET_KEY = 'commandCenterTarget';

/** Komutla küçük bir pencere açar; eylemlerin hedefi, pencere açılmadan önceki etkin sekmedir. */
export function initCommandCenterBackground(): void {
  chrome.commands.onCommand.addListener(command => {
    if (command !== 'open-command-center') return;
    void (async () => {
      if (!(await isModuleEnabled(COMMAND_CENTER_ID))) return;
      const tab = await getTargetTab();
      await chrome.storage.session.set({ [COMMAND_CENTER_TARGET_KEY]: tab?.id ?? null });
      await chrome.windows.create({ url: chrome.runtime.getURL('command-center.html'), type: 'popup', width: 680, height: 560, focused: true });
    })().catch(err => { console.debug('[Komut Merkezi]', err); });
  });
}
