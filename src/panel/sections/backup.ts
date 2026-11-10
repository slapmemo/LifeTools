import { requestRunAction } from '../../core/actions';
import { AUTO_BACKUP_ENABLED_KEY, LAST_AUTO_BACKUP_KEY } from '../../core/auto-backup';
import { validateBackup, type Backup } from '../../core/backup';
import { backupSettingKeys, settingsRestorePlan } from '../../core/backup-settings';
import { popupDb } from '../../db/client';
import { confirmSecondClick, showToast } from '../ui';

/** Yedek indirme, geri yükleme ve otomatik yedek bölümünü bağlar. */
export function initBackup(): void {
  const backupFile = document.querySelector('#backup-file') as HTMLInputElement;
  const backupPreview = document.querySelector('#backup-preview') as HTMLElement;
  const backupFeedback = document.querySelector('#backup-feedback') as HTMLElement;
  const backupRestore = document.querySelector('#backup-restore') as HTMLButtonElement;
  let selectedBackup: Backup | null = null;

  const backupError = (err: unknown): void => {
    const msg = `Hata: ${err instanceof Error ? err.message : String(err)}`;
    backupFeedback.textContent = msg;
    backupFeedback.className = 'feedback error';
    backupFeedback.hidden = false;
    showToast(msg, 'error');
  };

  const autoBackupEnabled = document.querySelector<HTMLInputElement>('#auto-backup-enabled')!;
  const autoBackupLast = document.querySelector<HTMLElement>('#auto-backup-last')!;
  const autoBackupError = document.createElement('div');
  autoBackupError.className = 'muted';
  autoBackupLast.insertAdjacentElement('afterend', autoBackupError);
  async function refreshAutoBackup(): Promise<void> {
    const data = await chrome.storage.local.get([AUTO_BACKUP_ENABLED_KEY, LAST_AUTO_BACKUP_KEY, 'autoBackup.lastError']);
    autoBackupEnabled.checked = data[AUTO_BACKUP_ENABLED_KEY] !== false;
    const date = new Date(data[LAST_AUTO_BACKUP_KEY] as string);
    autoBackupLast.textContent = `Son otomatik yedek: ${Number.isNaN(date.getTime()) ? 'henüz yok' : new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)}`;
    const failure = data['autoBackup.lastError'] as { error?: unknown } | undefined;
    autoBackupError.textContent = typeof failure?.error === 'string' ? `Son otomatik yedek başarısız: ${failure.error}` : '';
    autoBackupError.hidden = !autoBackupError.textContent;
  }
  autoBackupEnabled.addEventListener('change', () => {
    void chrome.storage.local.set({ [AUTO_BACKUP_ENABLED_KEY]: autoBackupEnabled.checked }).catch(backupError);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[AUTO_BACKUP_ENABLED_KEY] || changes[LAST_AUTO_BACKUP_KEY] || changes['autoBackup.lastError'])) void refreshAutoBackup();
  });
  void refreshAutoBackup();

  function takeBackup(): void {
    void (async () => {
      try {
        const result = await requestRunAction('backup.download');
        if (!result.ok) throw new Error(result.message ?? 'Yedek indirilemedi.');
        backupFeedback.textContent = 'Yedek indirme işlemi başlatıldı.';
        backupFeedback.className = 'feedback';
        backupFeedback.hidden = false;
        showToast('Yedek indirme işlemi başlatıldı.', 'info');
      } catch (err) {
        backupError(err);
      }
    })();
  }
  document.querySelector('#backup-download')!.addEventListener('click', takeBackup);
  document.querySelector('#auto-backup-now')!.addEventListener('click', takeBackup);

  backupFile.addEventListener('change', () => {
    void (async () => {
      selectedBackup = null;
      backupRestore.hidden = true;
      backupRestore.textContent = 'Geri yükle';
      backupRestore.classList.remove('confirming');
      backupPreview.textContent = '';
      backupFeedback.textContent = '';
      backupFeedback.hidden = true;
      if (!backupFile.files?.[0]) return;
      try {
        selectedBackup = validateBackup(JSON.parse(await backupFile.files[0].text()));
        const t = selectedBackup.tables;
        backupPreview.textContent = `${t.notes.length} not, ${t.snippets.length} şablon, ${t.tasks.length} görev, ${t.site_time.length} site süresi kaydı, ${t.sessions.length} oturum (${t.session_tabs.length} sekme). Mevcut veriler ve ayarlar değiştirilecek.`;
        backupRestore.hidden = false;
      } catch (err) {
        backupError(err);
      }
    })();
  });

  confirmSecondClick(
    backupRestore,
    async () => {
      if (!selectedBackup) return;
      backupRestore.disabled = true;
      backupFile.disabled = true;
      try {
        const settings = selectedBackup.settings;
        await popupDb.restoreBackup(selectedBackup);
        const plan = settingsRestorePlan(settings, backupSettingKeys());
        if (plan.remove.length) {
          await chrome.storage.local.remove(plan.remove);
          await chrome.storage.local.set(plan.set);
        }
        backupFeedback.textContent = plan.remove.length
          ? 'Yedek geri yüklendi. Eklenti yeniden başlatılıyor…'
          : 'Yedek geri yüklendi (bu yedekte eklenti ayarı yok, mevcut ayarlar korundu). Eklenti yeniden başlatılıyor…';
        backupFeedback.className = 'feedback';
        backupFeedback.hidden = false;
        showToast('Yedek geri yüklendi.', 'info');
        setTimeout(() => chrome.runtime.reload(), 1000);
      } catch (err) {
        backupError(err);
        backupRestore.disabled = false;
        backupFile.disabled = false;
      }
    },
    'Emin misin? Geri yükle'
  );
}
