/** executeScript içinde de çalışabilen, kendi kendine yeterli metin ekleme işlevi. */
export function insertText(body: string): boolean {
 const el = document.activeElement;
 if (!(el instanceof HTMLElement) || (el instanceof HTMLInputElement && el.type === 'password')) return false;
 if (!(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement || el.isContentEditable)) return false;
 if (document.execCommand('insertText', false, body)) return true;
 if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) { if (el.selectionStart === null || el.selectionEnd === null) return false; el.setRangeText(body, el.selectionStart, el.selectionEnd, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); return true; }
 return false;
}
