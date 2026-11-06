import { showToast } from '../../panel/ui';
import { CLIP_SLOTS_KEY, getSlots, SLOT_IDS } from './slots';

export function initClipSlotsPanel(): { render(): Promise<void> } {
  const root = document.querySelector('#clip-slots-panel') as HTMLElement;
  const list = root.querySelector('#clip-list') as HTMLElement;
  const feedback = root.querySelector('#clip-feedback') as HTMLElement;

  let editingIndex: number | null = null;

  function notify(text: string, isError = false): void {
    feedback.textContent = text;
    showToast(text, isError ? 'error' : 'info');
  }

  async function render(): Promise<void> {
    const slots = await getSlots();
    list.replaceChildren(
      ...slots.map((slot, i) => {
        const card = document.createElement('div');
        card.className = 'card clip-card';

        const header = document.createElement('div');
        header.className = 'clip-card-header';
        const badge = document.createElement('span');
        badge.className = 'chip chip-mono';
        badge.textContent = `Yuva ${SLOT_IDS[i]}`;
        const labelTitle = document.createElement('strong');
        labelTitle.className = 'clip-card-title';
        labelTitle.textContent = slot.label || 'Etiketsiz';
        header.append(badge, labelTitle);
        card.append(header);

        if (editingIndex === i) {
          const form = document.createElement('form');
          form.className = 'inline-editor';

          const labelInput = document.createElement('input');
          labelInput.type = 'text';
          labelInput.value = slot.label;
          labelInput.maxLength = 100;
          labelInput.placeholder = `Yuva ${SLOT_IDS[i]} etiketi`;
          labelInput.setAttribute('aria-label', `Yuva ${SLOT_IDS[i]} etiketi`);

          const textInput = document.createElement('textarea');
          textInput.rows = 4;
          textInput.value = slot.text;
          textInput.maxLength = 10000;
          textInput.placeholder = 'Yuvaya kaydedilecek metin…';
          textInput.setAttribute('aria-label', `Yuva ${SLOT_IDS[i]} metni`);

          const actions = document.createElement('div');
          actions.className = 'clip-card-actions';
          const save = document.createElement('button');
          save.type = 'submit';
          save.className = 'primary';
          save.textContent = 'Kaydet';
          const cancel = document.createElement('button');
          cancel.type = 'button';
          cancel.textContent = 'Vazgeç';
          cancel.onclick = () => {
            editingIndex = null;
            void render();
          };
          actions.append(save, cancel);

          form.append(labelInput, textInput, actions);
          form.onsubmit = event => {
            event.preventDefault();
            void (async () => {
              const current = await getSlots();
              current[i] = { label: labelInput.value.trim(), text: textInput.value };
              await chrome.storage.local.set({ [CLIP_SLOTS_KEY]: current });
              editingIndex = null;
              notify(`Yuva ${SLOT_IDS[i]} kaydedildi.`);
              await render();
            })();
          };
          card.append(form);
        } else {
          const preview = document.createElement('p');
          preview.className = `clip-preview clamp-2${slot.text ? '' : ' muted'}`;
          preview.textContent = slot.text || 'Henüz metin yok.';
          if (slot.text.length > 120) preview.title = slot.text;

          const actions = document.createElement('div');
          actions.className = 'clip-card-actions';
          const copy = document.createElement('button');
          copy.type = 'button';
          copy.className = 'primary';
          copy.textContent = 'Kopyala';
          copy.disabled = !slot.text;
          copy.onclick = () => {
            void navigator.clipboard
              .writeText(slot.text)
              .then(() => notify(`Yuva ${SLOT_IDS[i]} kopyalandı.`))
              .catch(() => notify('Kopyalanamadı.', true));
          };

          const edit = document.createElement('button');
          edit.type = 'button';
          edit.textContent = 'Düzenle';
          edit.onclick = () => {
            editingIndex = i;
            void render();
          };

          actions.append(copy, edit);
          card.append(preview, actions);
        }

        return card;
      })
    );
  }

  return { render };
}
