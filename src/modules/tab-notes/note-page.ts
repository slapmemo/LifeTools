// Runs in the extension's isolated world on the target page.
export function showTabNote(url: string, note: string): void {
  const id = 'lifetools-tab-note';
  if (document.getElementById(id)) return;
  const host = document.createElement('div'); host.id = id;
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `:host{all:initial;position:fixed;right:16px;top:16px;z-index:2147483647;font:14px system-ui;color-scheme:light dark} .card{width:260px;max-width:calc(100vw - 32px);padding:14px;border:1px solid #aaa;border-radius:10px;background:#fff;color:#222;box-shadow:0 4px 18px #0004} p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 10px} button{cursor:pointer;margin-right:8px} textarea{box-sizing:border-box;width:100%;min-height:80px} @media(prefers-color-scheme:dark){.card{background:#252525;color:#eee;border-color:#666}}`;
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
