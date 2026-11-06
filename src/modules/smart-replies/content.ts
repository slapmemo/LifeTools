import { findTriggerAtCaret } from './trigger';
import type { Snippet } from './repo';
let snippets: Snippet[] = [];
function refresh(): void { void chrome.runtime.sendMessage({ channel: 'smart-replies', action: 'list' }).then((value: Snippet[]) => { snippets = Array.isArray(value) ? value : []; }).catch(() => { snippets = []; }); }
refresh();
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes.smartReplyChanged || changes.moduleEnabled || changes.smartReplySites)) refresh(); });
document.addEventListener('keydown', event => {
  if ((event.key !== ' ' && event.key !== 'Tab') || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
  const el = event.target;
  if (!(el instanceof HTMLElement)) return;
  let before = ''; let range: Range | null = null;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if ((el instanceof HTMLInputElement && el.type === 'password') || el.selectionStart === null || el.selectionEnd !== el.selectionStart) return;
    before = el.value.slice(0, el.selectionStart);
  } else if (el.isContentEditable) {
    const selection = window.getSelection(); if (!selection || !selection.isCollapsed || !selection.rangeCount || !el.contains(selection.anchorNode)) return;
    range = selection.getRangeAt(0).cloneRange(); const prefix = range.cloneRange(); prefix.selectNodeContents(el); prefix.setEnd(range.endContainer, range.endOffset); before = prefix.toString();
  } else return;
  const trigger = findTriggerAtCaret(before, snippets.map(s => s.trigger)); if (!trigger) return;
  const snippet = snippets.find(s => s.trigger === trigger); if (!snippet) return;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const end = el.selectionStart!; el.setSelectionRange(end - trigger.length, end);
    if (!document.execCommand('insertText', false, snippet.body)) { el.setRangeText(snippet.body, end-trigger.length, end, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); }
  } else if (range) {
    const selection = window.getSelection()!; const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let node: Node | null; let offset = before.length-trigger.length; let start: Node | null = null;
    while ((node = walker.nextNode())) { const length = node.textContent?.length ?? 0; if (offset <= length) { start = node; break; } offset -= length; }
    if (!start) return; range.setStart(start, offset); selection.removeAllRanges(); selection.addRange(range);
    if (!document.execCommand('insertText', false, snippet.body)) return;
  }
  if (event.key === 'Tab') event.preventDefault();
  void chrome.runtime.sendMessage({ channel: 'smart-replies', action: 'used', id: snippet.id }).catch(() => {});
}, true);
