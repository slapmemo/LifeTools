import { TIME_TRACKER_ID } from '../modules/time-tracker/background';
import { initTimeTrackerPanel } from '../modules/time-tracker/panel';
import { QUICK_TASKS_ID } from '../modules/quick-tasks/background';
import { initQuickTasksPanel } from '../modules/quick-tasks/panel';
import { SMART_REPLIES_ID } from '../modules/smart-replies/background';
import { initSmartRepliesPanel } from '../modules/smart-replies/panel';
import { LINK_CLEANER_ID } from '../modules/link-cleaner/background';
import { initLinkCleanerPanel } from '../modules/link-cleaner/panel';
import { isModuleEnabled, MODULE_FLAGS_KEY, setModuleEnabled } from '../core/module-state';
import { popupDb } from '../db/client';
import { modules } from '../modules';
import { SITE_BLOCKER_ID } from '../modules/site-blocker/background';
import { initBlockerPanel } from '../modules/site-blocker/panel';
import { SLAPMEMO_ID } from '../modules/slapmemo/background';
import { initSlapMemoPanel } from '../modules/slapmemo/panel';

const timeSection = document.querySelector('#time-tracker-panel') as HTMLElement;
const timeTracker = initTimeTrackerPanel();
const tasksSection = document.querySelector('#quick-tasks-panel') as HTMLElement;
const tasks = initQuickTasksPanel();

const modulesList = document.querySelector('#modules-list') as HTMLElement;
const blockerSection = document.querySelector('#blocker-panel') as HTMLElement;
const dbStatus = document.querySelector('#db-status') as HTMLElement;

const memoSection = document.querySelector('#slapmemo-panel') as HTMLElement;

const cleanerSection = document.querySelector('#link-cleaner-panel') as HTMLElement;
const smartSection = document.querySelector('#smart-replies-panel') as HTMLElement;
const smart = initSmartRepliesPanel();
const cleaner = initLinkCleanerPanel();
const blocker = initBlockerPanel();
const memo = initSlapMemoPanel();

async function renderModules(): Promise<void> {
  modulesList.replaceChildren();
  for (const module of modules) {
    const enabled = await isModuleEnabled(module.id);

    const item = document.createElement('li');
    item.className = 'module-item';

    const text = document.createElement('div');
    text.className = 'module-text';
    const name = document.createElement('strong');
    name.textContent = module.name;
    const desc = document.createElement('p');
    desc.textContent = module.description;
    text.append(name, desc);

    const label = document.createElement('label');
    label.className = 'switch';
    label.setAttribute('aria-label', `${module.name} aç veya kapat`);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = enabled;
    input.addEventListener('change', () => {
      void setModuleEnabled(module.id, input.checked).then(refresh);
    });
    const track = document.createElement('span');
    track.className = 'switch-track';
    label.append(input, track);

    item.append(text, label);
    modulesList.append(item);
  }
}

async function refresh(): Promise<void> {
  await renderModules();
  timeSection.hidden = !(await isModuleEnabled(TIME_TRACKER_ID));
  if (!timeSection.hidden) await timeTracker.render();
  tasksSection.hidden = !(await isModuleEnabled(QUICK_TASKS_ID));
  if (!tasksSection.hidden) await tasks.render();
  smartSection.hidden = !(await isModuleEnabled(SMART_REPLIES_ID));
  if (!smartSection.hidden) await smart.render();
  blockerSection.hidden = !(await isModuleEnabled(SITE_BLOCKER_ID));
  if (!blockerSection.hidden) await blocker.render();
  memoSection.hidden = !(await isModuleEnabled(SLAPMEMO_ID));
  if (!memoSection.hidden) await memo.render();
  cleanerSection.hidden = !(await isModuleEnabled(LINK_CLEANER_ID));
  if (!cleanerSection.hidden) await cleaner.render();
}

async function showDbStatus(): Promise<void> {
  try {
    const version = await popupDb.schemaVersion();
    dbStatus.textContent = `Veritabanı durumu: hazır (şema sürümü ${version})`;
    dbStatus.className = 'db-status ok';
  } catch (err) {
    dbStatus.textContent = `Veritabanı durumu: hata — ${err instanceof Error ? err.message : String(err)}`;
    dbStatus.className = 'db-status error';
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.enabled || changes.blockedHandles || changes[MODULE_FLAGS_KEY])) {
    void refresh();
  }
});

void refresh();
void showDbStatus();
