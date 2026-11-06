import { isModuleEnabled, MODULE_FLAGS_KEY, setModuleEnabled } from '../core/module-state';
import { popupDb } from '../db/client';
import { modules } from '../modules';
import { SITE_BLOCKER_ID } from '../modules/site-blocker/background';
import { initBlockerPanel } from '../modules/site-blocker/panel';
import { SLAPMEMO_ID } from '../modules/slapmemo/background';
import { initSlapMemoPanel } from '../modules/slapmemo/panel';

const modulesList = document.querySelector('#modules-list') as HTMLElement;
const blockerSection = document.querySelector('#blocker-panel') as HTMLElement;
const dbStatus = document.querySelector('#db-status') as HTMLElement;

const memoSection = document.querySelector('#slapmemo-panel') as HTMLElement;

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
  blockerSection.hidden = !(await isModuleEnabled(SITE_BLOCKER_ID));
  if (!blockerSection.hidden) await blocker.render();
  memoSection.hidden = !(await isModuleEnabled(SLAPMEMO_ID));
  if (!memoSection.hidden) await memo.render();
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
