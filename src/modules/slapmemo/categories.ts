export const NOTE_CATEGORIES = ['note', 'read', 'watch', 'idea'] as const;

export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<NoteCategory, string> = {
  note: 'Notlar',
  read: 'Okunacaklar',
  watch: 'İzlenecekler',
  idea: 'Fikirler'
};

export function isNoteCategory(value: unknown): value is NoteCategory {
  return typeof value === 'string' && (NOTE_CATEGORIES as readonly string[]).includes(value);
}
