import { popupDb } from '../../db/client';

export async function showDbStatus(): Promise<void> {
  const dbStatus = document.querySelector('#db-status') as HTMLElement;
  try {
    const version = await popupDb.schemaVersion();
    dbStatus.textContent = `Veritabanı durumu: hazır (şema sürümü ${version})`;
    dbStatus.className = 'chip db-status ok';
  } catch (err) {
    dbStatus.textContent = `Veritabanı durumu: hata — ${err instanceof Error ? err.message : String(err)}`;
    dbStatus.className = 'chip chip-danger db-status error';
  }
}
