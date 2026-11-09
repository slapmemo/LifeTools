import { icon } from '../../../design/icons';
import { popupDb } from '../../db/client';
import type { Executor } from '../../db/migrations';
import {
  createEmptyState,
  createListRow,
  extractDomain,
  showToast
} from '../../panel/ui';
import { moveTabsToSession } from '../life-browser/browser';
import { createSessionsRepo } from '../life-browser/repo';
import { AUTO_SLEEP_KEY, WEEKLY_KEY, LAST_SLEEP_KEY, formatAge, LAST_ACTIVE_KEY, normalizeHours, selectZombies, ZOMBIE_HOURS_KEY, type Zombie } from './zombie';

function $<T extends HTMLElement>(selector: string): T {
  return document.querySelector(selector) as T;
}

const PRESET_HOURS = [1, 4, 12, 24, 48, 72, 168];

export function initZombieTabsPanel(db: Executor = popupDb): { render(): Promise<void> } {
  const repo = createSessionsRepo(db);
  const form = $<HTMLFormElement>('#zombie-form');
  const hoursInput = $<HTMLSelectElement | HTMLInputElement>('#zombie-hours');
  const list = $<HTMLElement>('#zombie-list');
  const empty = document.querySelector<HTMLElement>('#zombie-empty');
  const count = $<HTMLElement>('#zombie-count');
  const feedback = $<HTMLElement>('#zombie-feedback');
  const closeAll = $<HTMLButtonElement>('#zombie-close-all');
  const moveAll = $<HTMLButtonElement>('#zombie-move-all');
  const autoSleep = $<HTMLInputElement>('#zombie-auto-sleep');
  const weekly = $<HTMLInputElement>('#zombie-weekly');
  const lastSleep = $<HTMLElement>('#zombie-last-sleep');

  let zombies: Zombie<chrome.tabs.Tab>[] = [];
  let seq = 0;

  function say(text: string, error = false): void {
    feedback.textContent = text;
    feedback.className = error ? 'feedback error' : 'feedback';
    showToast(text, error ? 'error' : 'info');
  }

  function fail(err: unknown): void {
    say(err instanceof Error ? err.message : 'İşlem başarısız. Tekrar dene.', true);
  }

  async function act(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
      await render();
    } catch (err) {
      fail(err);
    }
  }

  const sessionName = (): string => `Zombi sekmeler ${new Date().toLocaleString('tr-TR')}`;

  async function close(tabs: chrome.tabs.Tab[]): Promise<void> {
    const ids = tabs.map(tab => tab.id).filter((id): id is number => id !== undefined);
    if (ids.length) await chrome.tabs.remove(ids);
    say(`${ids.length} sekme kapatıldı.`);
  }

  async function move(tabs: chrome.tabs.Tab[]): Promise<void> {
    if (!tabs.length) return;
    const name = sessionName();
    await moveTabsToSession(repo, name, tabs);
    say(`${tabs.length} sekme "${name}" oturumuna taşındı.`);
  }

  function buildFavicon(tab: chrome.tabs.Tab): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'tab-favicon-wrap';
    const raw = tab.favIconUrl ?? '';
    if (/^(https?:|data:)/i.test(raw)) {
      const img = document.createElement('img');
      img.className = 'tab-favicon';
      img.src = raw;
      img.width = 16;
      img.height = 16;
      img.alt = '';
      img.addEventListener('error', () => {
        wrap.replaceChildren(icon('layout-grid', 16));
      });
      wrap.append(img);
    } else {
      wrap.append(icon('layout-grid', 16));
    }
    return wrap;
  }

  function item(zombie: Zombie<chrome.tabs.Tab>, now: number): HTMLLIElement {
    const content = document.createElement('div');
    content.className = 'zombie-row-main';

    const title = document.createElement('strong');
    title.className = 'clamp-1';
    title.textContent = zombie.tab.title || zombie.tab.url || 'Adsız sekme';

    const domain = extractDomain(zombie.tab.url);
    if (domain) {
      const sub = document.createElement('span');
      sub.className = 'muted zombie-domain clamp-1';
      sub.textContent = domain;
      content.append(title, sub);
    } else {
      content.append(title);
    }

    const idleChip = document.createElement('span');
    idleChip.className = 'chip';
    idleChip.textContent = `${formatAge(now - zombie.lastActive)} boşta`;

    const actions = document.createElement('div');
    actions.className = 'row-action-group';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = 'Kapat';
    closeButton.addEventListener('click', () => {
      void act(() => close([zombie.tab]));
    });
    const moveButton = document.createElement('button');
    moveButton.type = 'button';
    moveButton.textContent = 'Oturuma taşı';
    moveButton.addEventListener('click', () => {
      void act(() => move([zombie.tab]));
    });
    actions.append(closeButton, moveButton);

    return createListRow({
      leading: buildFavicon(zombie.tab),
      content,
      meta: idleChip,
      actions,
      className: 'zombie-item'
    });
  }

  function ensureSelectOption(hours: number): void {
    if (!(hoursInput instanceof HTMLSelectElement)) return;
    const str = String(hours);
    if (!Array.from(hoursInput.options).some(opt => opt.value === str)) {
      const opt = document.createElement('option');
      opt.value = str;
      opt.textContent = `${hours} saat`;
      hoursInput.append(opt);
    }
  }

  async function render(): Promise<void> {
    const current = ++seq;
    try {
      const [settings, session, tabs] = await Promise.all([
        chrome.storage.local.get({ [ZOMBIE_HOURS_KEY]: null, [AUTO_SLEEP_KEY]: false, [WEEKLY_KEY]: true, [LAST_SLEEP_KEY]: null }),
        chrome.storage.session.get({ [LAST_ACTIVE_KEY]: {} }),
        chrome.tabs.query({ windowType: 'normal' })
      ]);
      if (current !== seq) return;
      const hours = normalizeHours(settings[ZOMBIE_HOURS_KEY]);
      autoSleep.checked = settings[AUTO_SLEEP_KEY] === true;
      weekly.checked = settings[WEEKLY_KEY] !== false;
      const sleep = settings[LAST_SLEEP_KEY] as { count?: number; time?: number } | null;
      lastSleep.textContent = sleep && typeof sleep.count === 'number' && typeof sleep.time === 'number' ? `Son uyutma: ${sleep.count} sekme · ${new Date(sleep.time).toLocaleString('tr-TR')}` : '';
      ensureSelectOption(hours);
      if (document.activeElement !== hoursInput) hoursInput.value = String(hours);
      const now = Date.now();
      zombies = selectZombies(tabs, session[LAST_ACTIVE_KEY] as Record<string, number>, now, hours);
      list.replaceChildren(...zombies.map(zombie => item(zombie, now)));
      list.hidden = zombies.length === 0;
      if (empty) {
        empty.hidden = zombies.length > 0;
        if (zombies.length === 0) {
          empty.replaceChildren(
            createEmptyState({
              icon: 'layout-grid',
              title: `${hours} saatten uzun süredir boşta kalan sekme yok.`,
              hint: 'Sabit, ses çalan ve etkin sekmeler önerilmez.'
            })
          );
        }
      }
      count.textContent = String(zombies.length);
      closeAll.hidden = moveAll.hidden = !zombies.length;
    } catch (err) {
      if (current === seq) fail(err);
    }
  }

  async function saveThreshold(): Promise<void> {
    const value = Number(hoursInput.value);
    if (!Number.isFinite(value) || value <= 0) throw new Error('Geçerli bir saat değeri gir.');
    await chrome.storage.local.set({ [ZOMBIE_HOURS_KEY]: normalizeHours(value) });
    say('Eşik güncellendi.');
  }

  void PRESET_HOURS;
  autoSleep.addEventListener('change', () => { void act(() => chrome.storage.local.set({ [AUTO_SLEEP_KEY]: autoSleep.checked })); });
  weekly.addEventListener('change', () => { void act(() => chrome.storage.local.set({ [WEEKLY_KEY]: weekly.checked })); });
  hoursInput.addEventListener('change', () => {
    void act(saveThreshold);
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    void act(saveThreshold);
  });
  closeAll.addEventListener('click', () => {
    void act(() => close(zombies.map(z => z.tab)));
  });
  moveAll.addEventListener('click', () => {
    void act(() => move(zombies.map(z => z.tab)));
  });

  return { render };
}
