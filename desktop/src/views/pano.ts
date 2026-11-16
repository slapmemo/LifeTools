import { icon } from '../../../design/icons';
import { api, errText } from '../api';
import { debounce, fmtTime, h, type View } from '../dom';
import { emptyState, rowMenu } from '../view-components';

export function clipboardView(): View {
  const search = h('input', { type: 'search', placeholder: 'Panoda ara…', 'aria-label': 'Panoda ara' });
  const searchBox = h('label', { class: 'search-field' }, icon('search', 16), search);
  const pauseBtn = h('button', { type: 'button' });
  const clearBtn = h('button', { type: 'button', class: 'danger-button' }, icon('trash-2', 16), 'Tümünü temizle');
  const banner = h('div', { class: 'card warning-banner', hidden: true }, icon('triangle-alert', 18), 'Pano kaydı duraklatıldı. Kopyaladıkların kaydedilmiyor.');
  const status = h('div', { class: 'muted status', role: 'status' });
  const list = h('div', { class: 'note-list' });
  const el = h(
    'section',
    {},
    h('header', { class: 'page-header page-header-row' },
      h('div', {},
        h('h2', { class: 'page-title page-title-icon' }, icon('clipboard', 26), 'Pano geçmişi'),
        h('p', { class: 'page-subtitle' }, 'Tıkla, yeniden panoya al.')),
      h('div', { class: 'page-actions' }, searchBox, pauseBtn, clearBtn)),
    banner,
    status,
    list
  );

  let paused = false;
  let armed: number | undefined;
  let statusTimer: number | undefined;

  function flash(msg: string): void {
    status.textContent = msg;
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => (status.textContent = ''), 2500);
  }

  function setClearLabel(text: string): void {
    clearBtn.replaceChildren(icon('trash-2', 16), text);
  }

  async function refresh(): Promise<void> {
    const [items, s] = await Promise.all([api.clipList(search.value), api.settingsGet()]);
    paused = s.paused;
    pauseBtn.replaceChildren(icon(paused ? 'play' : 'pause', 16), paused ? 'Devam et' : 'Duraklat');
    banner.hidden = !paused;
    list.replaceChildren();
    if (items.length === 0) {
      list.append(emptyState(search.value ? 'Sonuç yok' : 'Pano geçmişi boş', search.value ? 'Başka bir arama deneyin.' : 'Kopyaladığınız metinler burada görünür.', search.value ? undefined : 'clipboard'));
      return;
    }
    for (const it of items) {
      const copy = async () => {
        try { await api.clipCopy(it.id); flash('Panoya kopyalandı.'); }
        catch (e) { flash(errText(e)); }
      };
      const togglePin = async () => { await api.clipPin(it.id, !it.pinned); await refresh(); };
      const menu = rowMenu([
        { label: 'Kopyala', run: copy },
        { label: it.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle', run: togglePin },
        { label: 'Sil', danger: true, run: async () => { await api.clipDelete(it.id); await refresh(); } }
      ]);
      const pinBtn = h('button', {
        type: 'button', class: 'icon-button pin-button' + (it.pinned ? ' on' : ''),
        title: it.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle', 'aria-label': it.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle', 'aria-pressed': String(it.pinned)
      }, icon('pin', 16));
      pinBtn.addEventListener('click', (e) => { e.stopPropagation(); void togglePin(); });
      const isLink = /^https?:\/\/\S+$/.test(it.text.trim());
      list.append(h('div', { class: 'list-row clickable' + (it.pinned ? ' pinned' : ''), title: 'Tıkla: panoya kopyala', onClick: copy },
        h('span', { class: 'panel-row-icon' }, icon(isLink ? 'link' : 'file-text', 16)),
        h('div', { class: 'list-row-content' },
          h('div', { class: 'clamp-2 clip-text' }, it.text + (it.truncated ? '…' : '')),
          h('div', { class: 'panel-row-meta' }, fmtTime(it.created_at))),
        h('div', { class: 'list-row-actions' }, pinBtn, menu)));
    }
  }

  search.addEventListener('input', debounce(() => void refresh(), 150));
  pauseBtn.addEventListener('click', async () => {
    const s = await api.settingsGet();
    await api.settingsSet({ ...s, paused: !paused });
    await refresh();
  });
  clearBtn.addEventListener('click', async () => {
    if (armed === undefined) {
      setClearLabel('Emin misin? (sabitlenenler kalır)');
      armed = window.setTimeout(() => {
        armed = undefined;
        setClearLabel('Tümünü temizle');
      }, 3000);
      return;
    }
    window.clearTimeout(armed);
    armed = undefined;
    setClearLabel('Tümünü temizle');
    const n = await api.clipClear();
    flash(`${n} kayıt silindi.`);
    await refresh();
  });

  return { el, refresh };
}

let instance: View | null = null;

function ensureView(): View {
  if (!instance) instance = clipboardView();
  return instance;
}

export function mount(container: HTMLElement): void {
  const v = ensureView();
  container.replaceChildren(v.el);
  void v.refresh();
}

export function unmount(): void {
  instance?.el.remove();
}

export function refresh(): Promise<void> | void {
  return ensureView().refresh();
}
