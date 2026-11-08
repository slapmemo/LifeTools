export const NOTE_HINT_ENABLED_KEY = 'slapmemoPageHintEnabled';

export function noteCountText(count: number): string {
  return `📝 Bu sayfada ${count} notun var`;
}

/** Serialized by executeScript; keep this function self-contained. */
export function showNoteHint(data: { label: string; notes: Array<{ text: string; created_at: number }> }, theme: string): void {
  if (document.getElementById('lifetools-note-hint')) return;
  const host = document.createElement('div'); host.id = 'lifetools-note-hint';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = theme + `:host{position:fixed;bottom:20px;left:20px;z-index:2147483647} .box{background:var(--lt-surface);color:var(--lt-text);border:1px solid var(--lt-border);border-radius:10px;box-shadow:var(--lt-shadow);padding:6px;max-width:min(340px,85vw)} .head{display:flex} button{font:inherit;color:var(--lt-text);background:transparent;border:0;border-radius:6px;padding:6px;cursor:pointer}button:hover{background:var(--lt-sub)} .close{color:var(--lt-muted)} .list{max-height:50vh;overflow:auto} .item{border-top:1px solid var(--lt-border);padding:8px 4px;overflow-wrap:anywhere;white-space:pre-wrap} .meta{display:flex;align-items:center;justify-content:space-between;color:var(--lt-muted)} .footer{color:var(--lt-accent)}`;
  const box = document.createElement('div'); box.className = 'box';
  const head = document.createElement('div'); head.className = 'head';
  const toggle = document.createElement('button'); toggle.textContent = data.label; toggle.setAttribute('aria-expanded', 'false');
  const close = document.createElement('button'); close.textContent = '×'; close.className = 'close'; close.setAttribute('aria-label', 'Kapat'); close.onclick = () => host.remove();
  const list = document.createElement('div'); list.className = 'list'; list.hidden = true;
  toggle.onclick = () => { list.hidden = !list.hidden; toggle.setAttribute('aria-expanded', String(!list.hidden)); };
  for (const note of data.notes) {
    const item = document.createElement('div'); item.className = 'item';
    const text = document.createElement('div'); text.textContent = note.text.slice(0, 120);
    const meta = document.createElement('div'); meta.className = 'meta';
    const date = document.createElement('span'); date.textContent = new Date(note.created_at).toLocaleDateString('tr-TR');
    const copy = document.createElement('button'); copy.textContent = 'Kopyala';
    copy.onclick = () => { void navigator.clipboard.writeText(note.text).then(() => { copy.textContent = 'Kopyalandı'; }).catch(() => { copy.textContent = 'Kopyalanamadı'; }); };
    meta.append(date, copy); item.append(text, meta); list.append(item);
  }
  const footer = document.createElement('button'); footer.className = 'footer'; footer.textContent = 'Tümünü panelde gör';
  footer.onclick = () => { void chrome.runtime.sendMessage({ type: 'slapmemo:open-panel' }).catch(() => {}); };
  list.append(footer); head.append(toggle, close); box.append(head, list); shadow.append(style, box); (document.body || document.documentElement).append(host);
}
