import { PAGE_THEME } from '../../core/page-theme';

// When injected with executeScript, pass the theme explicitly.
export function showTabNote(url: string, note: string, theme: string = PAGE_THEME): void {
  const id = 'lifetools-tab-note';
  if (document.getElementById(id)) return;
  const host = document.createElement('div'); host.id = id;
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = theme + `:host{position:fixed;right:16px;top:16px;z-index:2147483647} .card{width:260px;max-width:calc(100vw - 32px);padding:14px;border:1px solid var(--lt-border);border-radius:10px;background:var(--lt-surface);color:var(--lt-text);box-shadow:var(--lt-shadow)} p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 10px} button{font:inherit;cursor:pointer;margin-right:8px;min-height:28px;padding:3px 9px;border:1px solid var(--lt-border);border-radius:8px;background:transparent;color:var(--lt-text)} button:hover{background:var(--lt-sub)} button:first-of-type{background:var(--lt-accent);border-color:var(--lt-accent);color:var(--lt-on-accent)} button:disabled{opacity:.5;cursor:default} textarea{font:inherit;color:var(--lt-text);background:var(--lt-bg);border:1px solid var(--lt-border);border-radius:8px;padding:6px;box-sizing:border-box;width:100%;min-height:80px}`;
  const card = document.createElement('div'); card.className = 'card';
  const text = document.createElement('p'); text.textContent = note;
  const edit = document.createElement('button'); edit.textContent = 'Düzenle';
  const close = document.createElement('button'); close.textContent = 'Kapat';
  close.onclick = () => { host.style.display = 'none'; };
  edit.onclick = () => {
    const input = document.createElement('textarea'); input.maxLength = 1000; input.value = text.textContent ?? '';
    text.replaceWith(input); edit.disabled = true; input.focus();
    input.onkeydown = event => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      void chrome.runtime.sendMessage({ type: 'tab-notes:set', url, note: input.value }).then(result => {
        if (!result?.ok) return;
        text.textContent = input.value.trim(); input.replaceWith(text); edit.disabled = false;
        if (!text.textContent) host.style.display = 'none';
      }).catch(() => {});
    };
  };
  card.append(text, edit, close); shadow.append(style, card); document.documentElement.append(host);
}
