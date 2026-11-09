export async function initVolumePopup(): Promise<void> {
  const root = document.getElementById('volume-booster')!;
  const slider = document.getElementById('volume-slider') as HTMLInputElement;
  const value = document.getElementById('volume-value')!;
  const error = document.getElementById('volume-error')!;
  const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (tab?.id === undefined) { root.hidden = true; return; }
  const tabId = tab.id;
  const send = (action: string, percent?: number) => chrome.runtime.sendMessage({ channel: 'lifetools:volume', action, tabId, percent });
  const show = (percent: number) => { slider.value = String(percent); value.textContent = `${percent}%`; };
  try { const current = await send('get'); if (current?.ok) show(current.percent); } catch { error.textContent = 'Ses düzeyi alınamadı.'; }
  let pending = Promise.resolve();
  const update = (action: string, percent?: number) => {
    if (percent !== undefined) show(percent);
    pending = pending.then(async () => { const result = await send(action, percent); if (!result?.ok) throw new Error(); show(result.percent); error.textContent = ''; }).catch(() => { error.textContent = 'Bu sekmenin sesi yakalanamadı.'; });
  };
  slider.oninput = () => update('set', Number(slider.value));
  root.querySelectorAll<HTMLButtonElement>('[data-volume]').forEach(button => { button.onclick = () => update('set', Number(button.dataset.volume)); });
  document.getElementById('volume-reset')!.onclick = () => update('reset');
}
