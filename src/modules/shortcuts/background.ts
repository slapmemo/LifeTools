import { isModuleEnabled } from '../../core/module-state';
import { runAction } from '../../core/action-runtime';
import { COMMAND_ACTIONS } from './duplicates';

export const SHORTCUTS_ID = 'shortcuts';

/** Manifest'te önerilen tuşu olmayan komutları eylem kaydına yönlendirir; tuşu Chrome yönetir. */
export function initShortcutsBackground(): void {
  chrome.commands.onCommand.addListener((command, tab) => {
    const actionId = COMMAND_ACTIONS[command];
    if (!actionId) return;
    void (async () => {
      if (!(await isModuleEnabled(SHORTCUTS_ID))) return;
      await runAction(actionId, undefined, tab);
    })();
  });
}
