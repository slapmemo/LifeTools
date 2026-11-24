// Düzenleyici arayüzü (TipTap) yalnız yazmaya başlanınca yüklensin diye tembel yükleme.
// Salt okunur ekranlar render.ts'i kullanır; bu dosyayı ve ui.ts'i içe aktarmaz.
// CSS ayrıca `shared/notes/notes.css` olarak yüklenir (bkz. docs/not-bicimi.md "Ekrana bağlama").

export function loadNoteEditorUI(): Promise<typeof import('./ui')> {
  return import('./ui');
}
