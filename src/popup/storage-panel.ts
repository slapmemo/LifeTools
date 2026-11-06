import { getBackend, setBackend, type DbBackend } from '../db/backend';
import { pingDesktop, popupDbFor } from '../db/client';
import type { PingInfo } from '../db/native';
import { TargetNotEmptyError, transferData } from '../db/transfer';

const msg = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** "Depolama" bölümü ve masaüstüne ulaşılamıyor uyarı şeridi. */
export function initStoragePanel(): { render(): Promise<void> } {
  const status = el('storage-status');
  const move = el<HTMLButtonElement>('storage-move');
  const back = el<HTMLButtonElement>('storage-back');
  const copyLabel = el('storage-copyback-label');
  const copyBack = el<HTMLInputElement>('storage-copyback');
  const feedback = el('storage-feedback');
  const banner = el('desktop-banner');
  const bannerSwitch = el<HTMLButtonElement>('desktop-banner-switch');

  const MOVE_LABEL = 'Verileri masaüstüne taşı';
  const OVERWRITE_LABEL = 'Masaüstündeki verilerin üzerine yaz';
  let confirmOverwrite = false;
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;

  const say = (text: string, kind: '' | 'error' | 'success' = ''): void => {
    feedback.textContent = text;
    feedback.className = `feedback ${kind}`.trim();
  };
  const disarm = (): void => {
    confirmOverwrite = false;
    clearTimeout(confirmTimer);
    move.textContent = MOVE_LABEL;
  };
  const busy = (on: boolean): void => {
    move.disabled = on;
    back.disabled = on;
    bannerSwitch.disabled = on;
  };

  async function render(): Promise<void> {
    const backend: DbBackend = await getBackend();
    let ping: PingInfo | null = null;
    let pingError = '';
    try {
      ping = await pingDesktop();
    } catch (err) {
      pingError = msg(err);
    }
    const where = backend === 'desktop' ? 'Masaüstü (paylaşılan veritabanı)' : 'Tarayıcı (bu Chrome profili)';
    const link = ping
      ? `masaüstü uygulamasına bağlı (sürüm ${ping.version}, masaüstü şema ${ping.desktopSchema})`
      : `masaüstü uygulamasına ulaşılamıyor${pingError && pingError !== 'Masaüstü uygulamasına ulaşılamıyor' ? ` — ${pingError}` : ''}`;
    status.textContent = `Geçerli depolama: ${where}. Durum: ${link}.`;
    move.hidden = backend === 'desktop';
    move.disabled = !ping;
    back.hidden = backend !== 'desktop';
    copyLabel.hidden = backend !== 'desktop';
    banner.hidden = !(backend === 'desktop' && !ping);
  }

  async function switchToBrowser(): Promise<void> {
    busy(true);
    try {
      if (!back.hidden && copyBack.checked) {
        say('Veriler tarayıcıya kopyalanıyor…');
        const counts = await transferData(popupDbFor('desktop'), popupDbFor('browser'), true);
        say(`Tarayıcıya kopyalandı ve doğrulandı (${Object.values(counts).reduce((a, b) => a + b, 0)} kayıt).`, 'success');
      }
      await setBackend('browser');
      if (!copyBack.checked) say('Tarayıcı depolamasına dönüldü. Masaüstündeki veriler olduğu gibi duruyor.', 'success');
      disarm();
      await render();
    } catch (err) {
      say(`Hata: ${msg(err)} Depolama değiştirilmedi.`, 'error');
    } finally {
      busy(false);
    }
  }

  move.addEventListener('click', () => void (async () => {
    busy(true);
    try {
      say('Masaüstü uygulaması denetleniyor…');
      await pingDesktop(); // (1)
      say('Taşınıyor…');
      // (2) masaüstünde migrasyon (3) tarayıcıdan oku (4) dolu hedefi onaysız reddet (5) tek işlemde yaz (6) doğrula
      const counts = await transferData(popupDbFor('browser'), popupDbFor('desktop'), confirmOverwrite);
      await setBackend('desktop'); // (7)
      disarm();
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      say(`Taşındı ve doğrulandı (${total} kayıt). Tarayıcı verilerin olduğu gibi korunuyor.`, 'success');
      await render();
    } catch (err) {
      if (err instanceof TargetNotEmptyError) {
        confirmOverwrite = true;
        move.textContent = OVERWRITE_LABEL;
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(disarm, 10_000);
        say(`Masaüstü veritabanında zaten ${err.total} eklenti kaydı var. Üzerine yazmak için "${OVERWRITE_LABEL}" düğmesine tekrar tıkla.`, 'error');
      } else {
        disarm();
        say(`Hata: ${msg(err)}`, 'error');
      }
    } finally {
      busy(false);
    }
  })());

  back.addEventListener('click', () => void switchToBrowser());
  bannerSwitch.addEventListener('click', () => {
    copyBack.checked = false;
    void switchToBrowser();
  });

  return { render };
}
