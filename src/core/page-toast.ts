import { PAGE_THEME } from './page-theme';

/** When injected with executeScript, pass the theme explicitly. */
export function pageToast(result: { ok: boolean; id?: number; duplicate?: boolean; category?: string; title?: string; undoType?: string; handle?: string }, theme: string = PAGE_THEME): void {
  document.getElementById('lifetools-slapmemo-toast')?.remove();
  const host = document.createElement('div');
  host.id = 'lifetools-slapmemo-toast';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = theme + `
    :host { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; }
    .toast { color: var(--lt-text); background: var(--lt-surface); border: 1px solid var(--lt-border); border-radius: 10px; box-shadow: var(--lt-shadow); padding: 14px; max-width: 340px; }
    strong { display: block; margin-bottom: 8px; } .actions { display: flex; flex-wrap: wrap; gap: 6px; }
    button { font: inherit; color: var(--lt-text); background: transparent; border: 1px solid var(--lt-border); border-radius: 8px; min-height: 28px; padding: 3px 9px; cursor: pointer; }
    button:hover { background: var(--lt-sub); }
    button.selected { background: var(--lt-accent-soft); border-color: var(--lt-accent); color: var(--lt-text); }
    input { font: inherit; color: var(--lt-text); background: var(--lt-bg); border: 1px solid var(--lt-border); border-radius: 8px; padding: 5px; width: 180px; }
  `;
  shadow.append(style);
  const box = document.createElement('div'); box.className = 'toast';
  const title = document.createElement('strong');
  title.textContent = result.title ?? (!result.ok ? 'Kaydedilemedi' : result.duplicate ? 'Bu not zaten kayıtlı' : 'Not kaydedildi ✓');
  box.append(title);
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => host.remove(), 4000); };
  box.addEventListener('mouseenter', () => clearTimeout(timer));
  box.addEventListener('mouseleave', schedule);
  if (result.ok && result.undoType && (result.id !== undefined || result.handle !== undefined)) {
    const actions = document.createElement('div'); actions.className = 'actions';
    const undo = document.createElement('button'); undo.textContent = 'Geri al';
    undo.addEventListener('click', () => { void chrome.runtime.sendMessage({ type: result.undoType, id: result.id, handle: result.handle }).then(response => { if (response?.ok) { host.remove(); document.dispatchEvent(new CustomEvent('lifetools-toast-undo')); } }).catch(() => {}); });
    actions.append(undo); box.append(actions);
  } else if (result.ok && !result.title && !result.duplicate && result.id !== undefined) {
    const actions = document.createElement('div'); actions.className = 'actions';
    const buttons: HTMLButtonElement[] = [];
    for (const [category, label] of [['read', 'Okunacak'], ['watch', 'İzlenecek'], ['idea', 'Fikir']]) {
      const button = document.createElement('button'); button.textContent = label;
      button.classList.toggle('selected', result.category === category);
      button.addEventListener('click', () => {
        void chrome.runtime.sendMessage({ type: 'slapmemo:update', id: result.id, category }).then(response => {
          if (response?.ok) { buttons.forEach(item => item.classList.remove('selected')); button.classList.add('selected'); }
        }).catch(() => {});
      });
      buttons.push(button); actions.append(button);
    }
    if (result.category === 'note') {
      const current = document.createElement('button'); current.textContent = 'Not'; current.className = 'selected';
      current.addEventListener('click', () => { void chrome.runtime.sendMessage({ type: 'slapmemo:update', id: result.id, category: 'note' }).then(response => { if (response?.ok) { buttons.forEach(item => item.classList.remove('selected')); current.classList.add('selected'); } }).catch(() => {}); });
      buttons.push(current); actions.prepend(current);
    }
    const comment = document.createElement('button'); comment.textContent = '✏️ Yorum';
    comment.addEventListener('click', () => {
      const input = document.createElement('input'); input.maxLength = 500; input.placeholder = 'Yorum';
      comment.replaceWith(input); clearTimeout(timer); input.focus();
      input.addEventListener('keydown', event => {
        if (event.key === 'Escape') { input.replaceWith(comment); schedule(); }
        if (event.key === 'Enter') {
          void chrome.runtime.sendMessage({ type: 'slapmemo:update', id: result.id, userNote: input.value }).then(response => {
            if (response?.ok) { input.replaceWith(comment); schedule(); }
          }).catch(() => {});
        }
      });
    });
    const undo = document.createElement('button'); undo.textContent = 'Geri al';
    undo.addEventListener('click', () => { void chrome.runtime.sendMessage({ type: 'slapmemo:undo', id: result.id }).then(response => { if (response?.ok) host.remove(); }).catch(() => {}); });
    actions.append(comment, undo); box.append(actions);
  }
  shadow.append(box); (document.body || document.documentElement).append(host); schedule();
}
