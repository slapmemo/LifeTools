/** Yerleşik dört kategori; migrasyon 13 bunları `note_categories` tablosuna tohumlar. */
export const NOTE_CATEGORIES = ['note', 'read', 'watch', 'idea'] as const;

export type BuiltinNoteCategory = (typeof NOTE_CATEGORIES)[number];

/** Kategori kimliği artık kullanıcı tanımlı olabilir; geçerli kimlikler `note_categories` tablosundadır. */
export type NoteCategory = string;

/** Silinemeyen, silinen kategorinin notlarının taşındığı kategori. */
export const DEFAULT_CATEGORY = 'note';

/** Yalnız yerleşik dört kategorinin etiketleri (eşzamanlı yedek; asıl kaynak `repo.listCategories`). */
export const CATEGORY_LABELS: Record<string, string> = {
  note: 'Notlar',
  read: 'Okunacaklar',
  watch: 'İzlenecekler',
  idea: 'Fikirler'
};

/**
 * Eşzamanlı, yalnız yerleşik dört kategoriyi tanır (yedek). Kullanıcı kategorileri için
 * `repo.categoryExists` kullanın (veritabanına bakar).
 */
export function isNoteCategory(value: unknown): value is NoteCategory {
  return typeof value === 'string' && (NOTE_CATEGORIES as readonly string[]).includes(value);
}

export interface NoteCategoryRow {
  id: string;
  label: string;
  color: string | null;
  position: number;
  builtin: number;
  created_at: number;
}

/** Notlar için izin verilen renk adları (renksiz = null). */
export const NOTE_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export function isNoteColor(value: unknown): value is NoteColor {
  return typeof value === 'string' && (NOTE_COLORS as readonly string[]).includes(value);
}

export const MAX_CATEGORY_LABEL = 40;

/** Kategori kimliği için ASCII karşılıklar; masaüstündeki `slugify_category_id` ile aynı tablo (ortak test: tests/fixtures/category-slugs.json). */
const SLUG_TABLE = 'a:àáâãäåāăą,c:çćčĉċ,d:ďđ,e:èéêëēĕėęě,g:ğĝġģ,h:ĥħ,i:ìíîïĩīĭįı,j:ĵ,k:ķ,l:ĺļľŀł,n:ñńņňŉ,o:òóôõöøōŏő,r:ŕŗř,s:śŝşš,t:ţťŧ,u:ùúûüũūŭůűų,w:ŵ,y:ýÿŷ,z:źżž,ss:ß,ae:æ,oe:œ';
const SLUG_MAP = new Map<string, string>();
for (const group of SLUG_TABLE.split(',')) { const [ascii, chars] = group.split(':'); for (const c of chars) SLUG_MAP.set(c, ascii); }

/** Etiketten URL/SQL için güvenli kimlik: küçük harf, aksanlar ASCII'ye (tablo), diğer her şey "-", en çok 24 karakter. */
export function slugifyCategoryId(label: string): string {
  let out = '';
  for (const original of label) {
    const c = original === 'İ' || original === 'I' ? 'i' : original.toLowerCase();
    for (const part of c.length === 1 ? [c] : [...c]) out += SLUG_MAP.get(part) ?? part;
  }
  const slug = out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/g, '');
  return slug || 'kategori';
}
