import { popupDb } from '../../db/client';
import type { Executor } from '../../db/migrations';
import { moveTabsToSession } from '../life-browser/browser';
import { createSessionsRepo } from '../life-browser/repo';
import { formatAge, LAST_ACTIVE_KEY, normalizeHours, selectZombies, ZOMBIE_HOURS_KEY, type Zombie } from './zombie';

function $<T extends HTMLElement>(selector: string): T { return document.querySelector(selector) as T; }

export function initZombieTabsPanel(db: Executor = popupDb): { render(): Promise<void> } {
  const repo = createSessionsRepo(db);
  const form = $<HTMLFormElement>('#zombie-form'), hoursInput = $<HTMLInputElement>('#zombie-hours');
  const list = $<HTMLElement>('#zombie-list'), count = $<HTMLElement>('#zombie-count'), feedback = $<HTMLElement>('#zombie-feedback');
  const closeAll = $<HTMLButtonElement>('#zombie-close-all'), moveAll = $<HTMLButtonElement>('#zombie-move-all');
  let zombies: Zombie<chrome.tabs.Tab>[] = [];
  let seq = 0;
  function say(text: string, error = false): void { feedback.textContent = text; feedback.className = error ? 'feedback error' : 'feedback'; }
  function fail(err: unknown): void { say(err instanceof Error ? err.message : 'İşlem başarısız. Tekrar dene.', true); }
  async function act(action: () => Promise<unknown>): Promise<void> { try { await action(); await render(); } catch (err) { fail(err); } }
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

  function item(zombie: Zombie<chrome.tabs.Tab>, now: number): HTMLLIElement {
    const li = document.createElement('li'); li.className = 'memo-item';
    const text = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = zombie.tab.title || zombie.tab.url || 'Adsız sekme';
    const meta = document.createElement('p'); meta.className = 'hint'; meta.textContent = `${formatAge(now - zombie.lastActive)} önce açıldı`;
    text.append(title, meta);
    const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.textContent = 'Kapat';
    closeButton.addEventListener('click', () => { void act(() => close([zombie.tab])); });
    const moveButton = document.createElement('button'); moveButton.type = 'button'; moveButton.textContent = 'Oturuma taşı';
    moveButton.addEventListener('click', () => { void act(() => move([zombie.tab])); });
    li.append(text, closeButton, moveButton);
    return li;
  }

  async function render(): Promise<void> {
    const current = ++seq;
    try {
      const [settings, session, tabs] = await Promise.all([
        chrome.storage.local.get({ [ZOMBIE_HOURS_KEY]: null }),
        chrome.storage.session.get({ [LAST_ACTIVE_KEY]: {} }),
        chrome.tabs.query({ windowType: 'normal' })
      ]);
      if (current !== seq) return;
      const hours = normalizeHours(settings[ZOMBIE_HOURS_KEY]);
      if (document.activeElement !== hoursInput) hoursInput.value = String(hours);
      const now = Date.now();
      zombies = selectZombies(tabs, session[LAST_ACTIVE_KEY] as Record<string, number>, now, hours);
      list.replaceChildren(...zombies.map(zombie => item(zombie, now)));
      if (!zombies.length) { const li = document.createElement('li'); li.className = 'hint'; li.textContent = `${hours} saatten uzun süredir açılmayan sekme yok.`; list.append(li); }
      count.textContent = String(zombies.length);
      closeAll.hidden = moveAll.hidden = !zombies.length;
    } catch (err) { if (current === seq) fail(err); }
  }

  form.addEventListener('submit', event => { event.preventDefault(); void act(async () => {
    const value = Number(hoursInput.value);
    if (!Number.isFinite(value) || value <= 0) throw new Error('Geçerli bir saat değeri gir.');
    await chrome.storage.local.set({ [ZOMBIE_HOURS_KEY]: normalizeHours(value) });
    hoursInput.blur();
    say('Kaydedildi.');
  }); });
  closeAll.addEventListener('click', () => { void act(() => close(zombies.map(z => z.tab))); });
  moveAll.addEventListener('click', () => { void act(() => move(zombies.map(z => z.tab))); });
  return { render };
}
