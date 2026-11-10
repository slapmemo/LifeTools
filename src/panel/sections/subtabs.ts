import { MODULE_FLAGS_KEY, resolveEnabled } from '../../core/module-state';
import {
  metinTabs,
  notlarTabs,
  odakTabs,
  resolveActiveTab,
  sekmelerTabs,
  type MetinSubTab,
  type NotlarSubTab,
  type OdakSubTab,
  type SekmelerSubTab
} from '../../core/ui-visibility';
import { PINNED_GUARD_ID } from '../../modules/pinned-guard/background';
import { ZOMBIE_TABS_ID } from '../../modules/zombie-tabs/background';

export interface SubTabsHandle {
  updateSubTabs: (rawFlags?: unknown) => Promise<void>;
  memoSection: HTMLElement;
  smartSection: HTMLElement;
}

/** Notlar / Metin / Sekmeler / Odak alt sekmelerini ve bölüm görünürlüğünü yönetir. */
export function initSubTabs(): SubTabsHandle {
  const watchSection = document.querySelector('#watchlist-panel') as HTMLElement;
  const clipSection = document.querySelector('#clip-slots-panel') as HTMLElement;
  const toolbarSection = document.querySelector('#site-toolbar-panel') as HTMLElement;
  const tabToolsSection = document.querySelector('#tab-tools') as HTMLElement;
  const lifeBrowserSection = document.querySelector('#life-browser-panel') as HTMLElement;
  const temizlikSection = document.querySelector('#sekmeler-temizlik') as HTMLElement;
  const zombieSection = document.querySelector('#zombie-tabs-panel') as HTMLElement;
  const pinnedSection = document.querySelector('#pinned-guard-panel') as HTMLElement;
  const timeSection = document.querySelector('#time-tracker-panel') as HTMLElement;
  const blockerSection = document.querySelector('#blocker-panel') as HTMLElement;
  const memoSection = document.querySelector('#slapmemo-panel') as HTMLElement;
  const cleanerSection = document.querySelector('#link-cleaner-panel') as HTMLElement;
  const smartSection = document.querySelector('#smart-replies-panel') as HTMLElement;

  let notlarTab: NotlarSubTab = 'slapmemo';
  let metinTab: MetinSubTab = 'smart-replies';
  let sekmelerTab: SekmelerSubTab = 'oturumlar';
  let odakTab: OdakSubTab = 'engelleyici';

  const notlarTabsWrap = document.getElementById('notlar-tabs')!;
  const memoNewBtn = document.getElementById('memo-new-btn') as HTMLButtonElement;
  const watchNewBtn = document.getElementById('watch-new-btn') as HTMLButtonElement;
  const metinTabsWrap = document.getElementById('metin-tabs')!;
  const sekmelerTabsWrap = document.getElementById('sekmeler-tabs')!;
  const odakTabsWrap = document.getElementById('odak-tabs')!;

  notlarTabsWrap.querySelectorAll<HTMLButtonElement>('[data-notlar-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      notlarTab = btn.dataset.notlarTab as NotlarSubTab;
      void updateSubTabs();
    });
  });

  metinTabsWrap.querySelectorAll<HTMLButtonElement>('[data-metin-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      metinTab = btn.dataset.metinTab as MetinSubTab;
      void updateSubTabs();
    });
  });

  sekmelerTabsWrap.querySelectorAll<HTMLButtonElement>('[data-sekmeler-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      sekmelerTab = btn.dataset.sekmelerTab as SekmelerSubTab;
      void updateSubTabs();
    });
  });

  odakTabsWrap.querySelectorAll<HTMLButtonElement>('[data-odak-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      odakTab = btn.dataset.odakTab as OdakSubTab;
      void updateSubTabs();
    });
  });

  async function updateSubTabs(rawFlags?: unknown): Promise<void> {
    const flags =
      rawFlags !== undefined
        ? rawFlags
        : (await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} }))[MODULE_FLAGS_KEY];

    // Notlar
    const enabledNotlar = notlarTabs(flags);
    notlarTab = resolveActiveTab(notlarTab, enabledNotlar, 'slapmemo');
    notlarTabsWrap.hidden = enabledNotlar.length <= 1;
    notlarTabsWrap.querySelectorAll<HTMLButtonElement>('[data-notlar-tab]').forEach(btn => {
      const key = btn.dataset.notlarTab as NotlarSubTab;
      btn.hidden = !enabledNotlar.includes(key);
      const active = key === notlarTab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    const showMemo = enabledNotlar.includes('slapmemo') && notlarTab === 'slapmemo';
    const showWatch = enabledNotlar.includes('watchlist') && notlarTab === 'watchlist';
    memoSection.hidden = !showMemo;
    watchSection.hidden = !showWatch;
    memoNewBtn.hidden = !showMemo;
    watchNewBtn.hidden = !showWatch;

    // Metin
    const enabledMetin = metinTabs(flags);
    metinTab = resolveActiveTab(metinTab, enabledMetin, 'smart-replies');
    metinTabsWrap.hidden = enabledMetin.length <= 1;
    metinTabsWrap.querySelectorAll<HTMLButtonElement>('[data-metin-tab]').forEach(btn => {
      const key = btn.dataset.metinTab as MetinSubTab;
      btn.hidden = !enabledMetin.includes(key);
      const active = key === metinTab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    smartSection.hidden = !(enabledMetin.includes('smart-replies') && metinTab === 'smart-replies');
    clipSection.hidden = !(enabledMetin.includes('clip-slots') && metinTab === 'clip-slots');
    cleanerSection.hidden = !(enabledMetin.includes('link-cleaner') && metinTab === 'link-cleaner');

    // Sekmeler
    const enabledSekmeler = sekmelerTabs(flags);
    sekmelerTab = resolveActiveTab(sekmelerTab, enabledSekmeler, 'oturumlar');
    sekmelerTabsWrap.hidden = enabledSekmeler.length <= 1;
    sekmelerTabsWrap.querySelectorAll<HTMLButtonElement>('[data-sekmeler-tab]').forEach(btn => {
      const key = btn.dataset.sekmelerTab as SekmelerSubTab;
      btn.hidden = !enabledSekmeler.includes(key);
      const active = key === sekmelerTab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    lifeBrowserSection.hidden = !(enabledSekmeler.includes('oturumlar') && sekmelerTab === 'oturumlar');
    temizlikSection.hidden = !(enabledSekmeler.includes('temizlik') && sekmelerTab === 'temizlik');
    zombieSection.hidden = !resolveEnabled(flags, ZOMBIE_TABS_ID);
    pinnedSection.hidden = !resolveEnabled(flags, PINNED_GUARD_ID);
    tabToolsSection.hidden = !(enabledSekmeler.includes('etiket-notlar') && sekmelerTab === 'etiket-notlar');
    toolbarSection.hidden = !(enabledSekmeler.includes('arac-cubugu') && sekmelerTab === 'arac-cubugu');

    // Odak
    const enabledOdak = odakTabs(flags);
    odakTab = resolveActiveTab(odakTab, enabledOdak, 'engelleyici');
    odakTabsWrap.hidden = enabledOdak.length <= 1;
    odakTabsWrap.querySelectorAll<HTMLButtonElement>('[data-odak-tab]').forEach(btn => {
      const key = btn.dataset.odakTab as OdakSubTab;
      btn.hidden = !enabledOdak.includes(key);
      const active = key === odakTab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    blockerSection.hidden = !(enabledOdak.includes('engelleyici') && odakTab === 'engelleyici');
    timeSection.hidden = !(enabledOdak.includes('sureler') && odakTab === 'sureler');
  }

  return { updateSubTabs, memoSection, smartSection };
}
