import { flashBadge } from '../../core/badge';
import {
  registerContextMenuLoader,
  scheduleContextMenuRebuild,
  setContextMenuContributions,
  type ContextMenuContribution
} from '../../core/context-menu';
import { insertText } from '../../core/insert-text';
import { isModuleEnabled, MODULE_FLAGS_KEY, resolveEnabled } from '../../core/module-state';
import { replaceSiteScript } from '../../core/site-scripts';
import { backgroundDb } from '../../db/host';
import { createSnippetsRepo, type Snippet } from './repo';

export const SMART_REPLIES_ID = 'smart-replies';
export const SITES_KEY = 'smartReplySites';
export const CHANGE_KEY = 'smartReplyChanged';

const ROOT = 'smart-replies-root';
const PREFIX = 'smart-replies:';
const SCRIPT = 'smart-replies-expander';
const SCRIPT_FILE = 'smart-replies-content.js';

const repo = createSnippetsRepo(backgroundDb);

export function smartRepliesMenuContributions(
  snippets: readonly Pick<Snippet, 'id' | 'trigger' | 'title'>[]
): ContextMenuContribution[] {
  const items: ContextMenuContribution[] = [
    {
      id: ROOT,
      title: 'Şablon ekle',
      contexts: ['editable'],
      moduleId: SMART_REPLIES_ID,
      enabled: flags => resolveEnabled(flags, SMART_REPLIES_ID)
    }
  ];

  for (const snippet of snippets.slice(0, 10)) {
    const snippetId = snippet.id;
    items.push({
      id: PREFIX + snippetId,
      parent: ROOT,
      title: `${snippet.trigger} — ${snippet.title}`,
      contexts: ['editable'],
      moduleId: SMART_REPLIES_ID,
      enabled: flags => resolveEnabled(flags, SMART_REPLIES_ID),
      onClick: async (info, tab) => {
        if (tab?.id === undefined || !(await isModuleEnabled(SMART_REPLIES_ID))) return;
        const target = (await repo.list()).find(s => s.id === snippetId);
        if (!target) return;
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
            args: [target.body],
            func: insertText
          });
          if (!results[0]?.result) {
            flashBadge('!');
            return;
          }
          await repo.incrementUse(target.id);
          scheduleContextMenuRebuild();
          flashBadge('✓');
        } catch {
          flashBadge('!');
        }
      }
    });
  }

  return items;
}

let scriptSync: Promise<void> = Promise.resolve();

function syncSiteScripts(): void {
  scriptSync = scriptSync
    .then(async () => {
      if (!(await isModuleEnabled(SMART_REPLIES_ID))) {
        await replaceSiteScript(SCRIPT, [], SCRIPT_FILE, true);
        return;
      }
      const data = await chrome.storage.local.get({ [SITES_KEY]: [] });
      await replaceSiteScript(SCRIPT, data[SITES_KEY] as string[], SCRIPT_FILE, true);
    })
    .catch(err => {
      console.debug('[Akıllı Yanıtlar]', err);
    });
}

export function initSmartRepliesBackground(): void {
  setContextMenuContributions(SMART_REPLIES_ID, smartRepliesMenuContributions([]));
  registerContextMenuLoader(SMART_REPLIES_ID, async () => {
    if (!(await isModuleEnabled(SMART_REPLIES_ID))) {
      setContextMenuContributions(SMART_REPLIES_ID, smartRepliesMenuContributions([]));
      return;
    }
    const snippets = await repo.list();
    setContextMenuContributions(SMART_REPLIES_ID, smartRepliesMenuContributions(snippets));
  });

  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg?.channel !== 'smart-replies') return false;
    void (async () => {
      if (!(await isModuleEnabled(SMART_REPLIES_ID))) return [];
      if (msg.action === 'list' || msg.action === 'used') {
        const data = await chrome.storage.local.get({ [SITES_KEY]: [] });
        let origin = '';
        try {
          const url = new URL(sender.url ?? '');
          origin = `${url.protocol}//${url.hostname}/*`;
        } catch {
          return [];
        }
        if (
          !(data[SITES_KEY] as string[]).includes(origin) ||
          !(await chrome.permissions.contains({ origins: [origin] }))
        ) {
          return [];
        }
      }
      if (msg.action === 'list') return repo.list();
      if (msg.action === 'used' && Number.isInteger(msg.id)) {
        await repo.incrementUse(msg.id);
        scheduleContextMenuRebuild();
      }
      return [];
    })()
      .then(respond)
      .catch(() => respond([]));
    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[MODULE_FLAGS_KEY] || changes[SITES_KEY]) syncSiteScripts();
    if (changes[CHANGE_KEY]) scheduleContextMenuRebuild();
  });

  chrome.runtime.onInstalled.addListener(syncSiteScripts);
  chrome.runtime.onStartup.addListener(syncSiteScripts);
  syncSiteScripts();
  scheduleContextMenuRebuild();
}
