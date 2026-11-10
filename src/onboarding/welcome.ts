import { modules } from '../modules';
import { MODULE_FLAGS_KEY, resolveEnabled } from '../core/module-state';
import { ONBOARDING_DONE_KEY, recommendedFlags } from '../core/onboarding';
import { applyTheme } from '../core/theme';

const groups: readonly [string, readonly string[]][] = [
  ['Video ve medya', ['video-downloader', 'instagram', 'x-video', 'pip', 'volume-booster', 'watchlist']],
  ['Sekmeler', ['tab-switcher', 'tab-manager', 'life-browser', 'tab-notes', 'tab-labels', 'zombie-tabs', 'pinned-guard', 'title-cleaner']],
  ['Notlar ve verimlilik', ['slapmemo', 'quick-tasks', 'command-center', 'clip-slots', 'smart-replies', 'link-cleaner', 'shortcuts']],
  ['Odak ve takip', ['site-blocker', 'time-tracker', 'site-toolbar']]
];

const container = document.querySelector<HTMLElement>('#groups')!;
const form = document.querySelector<HTMLFormElement>('#welcome-form')!;
const inputs = new Map<string, HTMLInputElement>();
const knownIds = new Set(groups.flatMap(([, ids]) => ids));

function renderGroup(title: string, ids: readonly string[], flags: unknown): void {
  const items = ids.map(id => modules.find(module => module.id === id)).filter((module): module is (typeof modules)[number] => module !== undefined);
  if (!items.length) return;
  const section = document.createElement('section');
  section.className = 'card group';
  const heading = document.createElement('h2');
  heading.textContent = title;
  section.append(heading);
  for (const module of items) {
    const label = document.createElement('label');
    label.className = 'feature';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = resolveEnabled(flags, module.id);
    inputs.set(module.id, input);
    const text = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = module.name;
    const description = document.createElement('small');
    description.textContent = module.description;
    text.append(name, description);
    label.append(input, text);
    section.append(label);
  }
  container.append(section);
}

async function init(): Promise<void> {
  await applyTheme();
  const data = await chrome.storage.local.get(MODULE_FLAGS_KEY);
  for (const [title, ids] of groups) renderGroup(title, ids, data[MODULE_FLAGS_KEY]);
  renderGroup('Diğer', modules.filter(module => !knownIds.has(module.id)).map(module => module.id), data[MODULE_FLAGS_KEY]);
}

document.querySelector<HTMLButtonElement>('#recommended')!.addEventListener('click', () => {
  const flags = recommendedFlags(modules.map(module => module.id));
  for (const [id, input] of inputs) input.checked = flags[id];
});
document.querySelector<HTMLButtonElement>('#select-all')!.addEventListener('click', () => {
  for (const input of inputs.values()) input.checked = true;
});
document.querySelector<HTMLButtonElement>('#select-none')!.addEventListener('click', () => {
  for (const input of inputs.values()) input.checked = false;
});
form.addEventListener('submit', event => {
  event.preventDefault();
  void (async () => {
    const flags = Object.fromEntries([...inputs].map(([id, input]) => [id, input.checked]));
    await chrome.storage.local.set({ [MODULE_FLAGS_KEY]: flags, [ONBOARDING_DONE_KEY]: true });
    document.querySelector<HTMLElement>('#feedback')!.textContent = 'Kaydedildi ✓';
    document.querySelector<HTMLElement>('#panel-link')!.hidden = false;
  })();
});
void init();
