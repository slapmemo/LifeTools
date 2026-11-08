// executeScript serializes this function, so it must be self-contained.
export function applyLabelTitle(prefix: string, prefixes: string[]): void {
  const page = window as unknown as { __lifeToolsTitle?: { prefix: string; observer: MutationObserver } };
  if (!prefix && !page.__lifeToolsTitle) return;
  const update = () => {
    let title = document.title;
    while (prefixes.some(p => title.startsWith(p))) title = title.slice(prefixes.find(p => title.startsWith(p))!.length);
    const next = (page.__lifeToolsTitle?.prefix ?? '') + title;
    if (document.title !== next) document.title = next;
  };
  if (!page.__lifeToolsTitle) {
    const observer = new MutationObserver(update);
    page.__lifeToolsTitle = { prefix, observer };
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  } else page.__lifeToolsTitle.prefix = prefix;
  update();
  if (!prefix) {
    page.__lifeToolsTitle.observer.disconnect();
    delete page.__lifeToolsTitle;
  }
}
