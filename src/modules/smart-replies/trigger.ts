export function findTriggerAtCaret(textBeforeCaret: string, triggers: readonly string[]): string | null {
  const text = textBeforeCaret.toLowerCase();
  return [...triggers].sort((a,b) => b.length-a.length).find(trigger => {
    if (!text.endsWith(trigger.toLowerCase())) return false;
    const before = text.slice(0, -trigger.length);
    return !before || !/[\p{L}\p{N}_]/u.test(before.at(-1)!);
  }) ?? null;
}
