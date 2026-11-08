import { api, errText } from '../api';
import { debounce, fmtTime, h, type View } from '../dom';
import { emptyState, rowMenu } from '../view-components';

export function clipboardView(): View {
  const search = h('input', { type: 'search', class: 'grow', placeholder: 'Panoda ara…' });
  const pauseBtn = h('button', {}, 'Duraklat');
  const clearBtn = h('button', { class: 'danger' }, 'Tümünü temizle');
  const banner = h('div', { class: 'banner', hidden: true }, 'Pano kaydı duraklatıldı. Kopyaladıkların kaydedilmiyor.');
  const status = h('div', { class: 'muted status' });
  const list = h('div', { class: 'card list-card' });
  const el = h(
    'section',
    {},
    h('h2', {}, 'Pano geçmişi'),
    h('div', { class: 'toolbar' }, search, pauseBtn, clearBtn),
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

  async function refresh(): Promise<void> {
    const [items, s] = await Promise.all([api.clipList(search.value), api.settingsGet()]);
    paused = s.paused;
    pauseBtn.textContent = paused ? 'Devam et' : 'Duraklat';
    banner.hidden = !paused;
    list.replaceChildren();
    if (items.length === 0) {
      list.append(emptyState(search.value ? 'Sonuç yok' : 'Pano geçmişi boş', search.value ? 'Başka bir arama deneyin.' : 'Kopyaladığınız metinler burada görünür.'));
      return;
    }
    for (const it of items) {
      const copy = async () => {
        try { await api.clipCopy(it.id); flash('Panoya kopyaland?.'); }
        catch (e) { flash(errText(e)); }
      };
      const menu = rowMenu([
        { label: 'Kopyala', run: copy },
        { label: it.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle', run: async () => { await api.clipPin(it.id, !it.pinned); await refresh(); } },
        { label: 'Sil', danger: true, run: async () => { await api.clipDelete(it.id); await refresh(); } }
      ]);
      list.append(h('div', { class: 'list-row clickable', title: 'Tıkla: panoya kopyala', onClick: copy },
        h('div', { class: 'list-row-content clamp-2' }, it.text + (it.truncated ? '?' : '')),
        h('div', { class: 'list-row-meta' }, it.pinned ? h('span', { class: 'chip' }, 'Sabit') : null, h('span', { class: 'muted' }, fmtTime(it.created_at))),
        h('div', { class: 'list-row-actions' }, menu)));
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
      clearBtn.textContent = 'Emin misin? Tekrar tıkla (sabitlenenler korunur)';
      armed = window.setTimeout(() => {
        armed = undefined;
        clearBtn.textContent = 'Tümünü temizle';
      }, 3000);
      return;
    }
    window.clearTimeout(armed);
    armed = undefined;
    clearBtn.textContent = 'Tümünü temizle';
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
