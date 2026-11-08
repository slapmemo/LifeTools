import { popupDb } from '../../db/client';
import type { Executor } from '../../db/migrations';
import {
  confirmSecondClick,
  createEmptyState,
  showToast
} from '../../panel/ui';
import { EXCLUDED_KEY } from './background';
import { createTimeTrackerRepo } from './repo';
import { localDay, siteKey } from './tracker';
import { LIMITS_KEY, LIMITS_ENABLED_KEY, type DailyLimits } from './limits';

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} sa ${m} dk` : m ? `${m} dk` : `${seconds} sn`;
}

function $<T extends HTMLElement>(s: string): T {
  return document.querySelector(s) as T;
}

export function initTimeTrackerPanel(db: Executor = popupDb): { render(): Promise<void> } {
  const repo = createTimeTrackerRepo(db);
  const list = $<HTMLElement>('#time-list');
  const empty = document.querySelector<HTMLElement>('#time-empty');
  const exclusions = $<HTMLElement>('#time-exclusions');
  const input = $<HTMLInputElement>('#time-domain');
  const feedback = $<HTMLElement>('#time-feedback');
  const del = $<HTMLButtonElement>('#time-delete');
  const heading = document.querySelector<HTMLElement>('#time-heading');
  const rangeBtns = document.querySelectorAll<HTMLButtonElement>('[data-time-range]');
  const limitsList = $<HTMLElement>('#time-limits');
  const limitToggle = $<HTMLInputElement>('#time-limits-enabled');

  let week = false;

  function say(text: string, isError = false): void {
    feedback.textContent = text;
    feedback.className = isError ? 'feedback error' : 'feedback';
    if (text) showToast(text, isError ? 'error' : 'info');
  }

  function updateRangeButtons(): void {
    rangeBtns.forEach(btn => {
      const isWeek = btn.dataset.timeRange === 'week';
      const active = isWeek === week;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    if (heading) heading.textContent = week ? '7 gün' : 'Bugün';
  }

  async function render(): Promise<void> {
    try {
      updateRangeButtons();
      const now = Date.now();
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      const rows = week
        ? await repo.getRange(localDay(d.getTime()), localDay(now))
        : await repo.getDay(localDay(now));
      const total = rows.reduce((sum, r) => sum + r.seconds, 0);
      $('#time-total').textContent = `Toplam: ${formatDuration(total)}`;

      list.replaceChildren();
      for (const row of rows) {
        const li = document.createElement('li');
        li.className = 'list-row time-row';

        const main = document.createElement('div');
        main.className = 'time-row-main';

        const header = document.createElement('div');
        header.className = 'time-row-header';

        const domainEl = document.createElement('strong');
        domainEl.className = 'time-domain';
        domainEl.textContent = row.domain;

        const durEl = document.createElement('span');
        durEl.className = 'time-duration muted';
        durEl.textContent = formatDuration(row.seconds);

        header.append(domainEl, durEl);

        const bar = document.createElement('div');
        bar.className = 'time-bar';
        const fill = document.createElement('div');
        fill.className = 'time-bar-fill';
        fill.style.width = `${total ? (100 * row.seconds) / total : 0}%`;
        bar.append(fill);

        main.append(header, bar);
        li.append(main);
        list.append(li);
      }

      list.hidden = rows.length === 0;
      if (empty) {
        empty.hidden = rows.length > 0;
        if (rows.length === 0) {
          empty.replaceChildren(
            createEmptyState({
              icon: 'timer',
              title: week ? 'Son 7 günde süre kaydı yok.' : 'Bugün henüz süre kaydı yok.',
              hint: 'Açık sekmelerde geçirdiğin etkin süre otomatik olarak takip edilir.'
            })
          );
        }
      }

      const values = (await chrome.storage.local.get({ [EXCLUDED_KEY]: [] }))[EXCLUDED_KEY] as string[];
      const settings = await chrome.storage.local.get({ [LIMITS_KEY]: {}, [LIMITS_ENABLED_KEY]: false });
      const limits = settings[LIMITS_KEY] as DailyLimits;
      limitToggle.checked = settings[LIMITS_ENABLED_KEY] === true;
      limitsList.replaceChildren();
      if (!Object.keys(limits).length) {
        const li = document.createElement('li'); li.className = 'muted'; li.textContent = 'Limit yok.'; limitsList.append(li);
      }
      for (const [domain, minutes] of Object.entries(limits)) {
        const li = document.createElement('li'); li.className = 'chip';
        const label = document.createElement('span'); label.textContent = `${domain} · ${minutes} dk`;
        const button = document.createElement('button'); button.type = 'button'; button.className = 'chip-remove'; button.textContent = '×'; button.setAttribute('aria-label', `${domain} limitini kaldır`);
        button.addEventListener('click', () => { void (async () => { const current = (await chrome.storage.local.get({ [LIMITS_KEY]: {} }))[LIMITS_KEY] as DailyLimits; delete current[domain]; await chrome.storage.local.set({ [LIMITS_KEY]: current }); await render(); })(); });
        li.append(label, button); limitsList.append(li);
      }
      exclusions.replaceChildren();
      if (values.length === 0) {
        const li = document.createElement('li');
        li.className = 'muted';
        li.textContent = 'Hariç tutulan site yok.';
        exclusions.append(li);
      } else {
        for (const domain of values) {
          const li = document.createElement('li');
          li.className = 'chip';
          const textSpan = document.createElement('span');
          textSpan.textContent = domain;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'chip-remove';
          button.textContent = '×';
          button.setAttribute('aria-label', `${domain} hariç tutma listesinden kaldır`);
          button.addEventListener('click', () => {
            void chrome.storage.local
              .set({ [EXCLUDED_KEY]: values.filter(v => v !== domain) })
              .then(() => {
                say(`${domain} listeden kaldırıldı.`);
                return render();
              });
          });
          li.append(textSpan, button);
          exclusions.append(li);
        }
      }
    } catch (e) {
      say(e instanceof Error ? e.message : 'İşlem başarısız.', true);
    }
  }

  rangeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      week = btn.dataset.timeRange === 'week';
      void render();
    });
  });

  const legacyToggle = document.querySelector<HTMLButtonElement>('#time-toggle');
  limitToggle.addEventListener('change', () => { void chrome.storage.local.set({ [LIMITS_ENABLED_KEY]: limitToggle.checked }); });
  $('#time-limit-form').addEventListener('submit', e => {
    e.preventDefault();
    void (async () => {
      const domainInput = $<HTMLInputElement>('#time-limit-domain');
      const minuteInput = $<HTMLInputElement>('#time-limit-minutes');
      const domain = siteKey(domainInput.value.includes('://') ? domainInput.value : 'https://' + domainInput.value);
      const minutes = Number(minuteInput.value);
      if (!domain || !Number.isInteger(minutes) || minutes < 5 || minutes > 1440) { say('Geçerli bir site ve 5–1440 dakika gir.', true); return; }
      const limits = (await chrome.storage.local.get({ [LIMITS_KEY]: {} }))[LIMITS_KEY] as DailyLimits;
      if (!(domain in limits) && Object.keys(limits).length >= 20) { say('En fazla 20 site eklenebilir.', true); return; }
      await chrome.storage.local.set({ [LIMITS_KEY]: { ...limits, [domain]: minutes } });
      domainInput.value = ''; minuteInput.value = ''; say(`${domain} limiti kaydedildi.`); await render();
    })();
  });
  legacyToggle?.addEventListener('click', () => {
    week = !week;
    void render();
  });

  $('#time-form').addEventListener('submit', e => {
    e.preventDefault();
    void (async () => {
      const domain = siteKey(input.value.includes('://') ? input.value : 'https://' + input.value);
      if (!domain) {
        say('Geçerli bir site gir.', true);
        return;
      }
      const values = (await chrome.storage.local.get({ [EXCLUDED_KEY]: [] }))[EXCLUDED_KEY] as string[];
      await chrome.storage.local.set({ [EXCLUDED_KEY]: [...new Set([...values, domain])] });
      input.value = '';
      say(`${domain} hariç tutuldu.`);
      await render();
    })();
  });

  confirmSecondClick(del, async () => {
    await repo.deleteAll();
    say('Tüm süre verileri silindi.');
    await render();
  });

  return { render };
}
