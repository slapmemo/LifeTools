import { icon, type IconName } from '../../design/icons';

export interface TaskGroups<T> {
  overdue: T[];
  today: T[];
  upcoming: T[];
  undated: T[];
}

export interface KebabMenuItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  confirm?: boolean;
  onSelect: () => void | Promise<void>;
}

export interface EmptyStateOptions {
  icon?: IconName;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface ListRowOptions {
  leading?: Node;
  content: Node;
  meta?: Node;
  actions?: Node;
  className?: string;
  onClick?: () => void;
}

/** Zaman damgasını Türkçe göreli tarihe ("az önce", "2 saat önce", "dün" veya tarih) çevirir. */
export function formatRelativeDate(ms: number, nowMs: number = Date.now()): string {
  const diffMs = Math.max(0, nowMs - ms);
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);

  if (diffMin < 1) return 'az önce';
  if (diffMin < 60) return `${diffMin} dk önce`;
  if (diffHours < 24) return `${diffHours} saat önce`;

  const d = new Date(ms);
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;

  if ((ms >= startOfYesterday && ms < startOfToday) || (diffHours >= 24 && diffHours < 48)) {
    return 'dün';
  }

  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
  });
}

/** Açık görevleri bugünün tarihine (YYYY-MM-DD) göre Gecikmiş / Bugün / Yaklaşan / Tarihsiz olarak gruplar. */
export function groupTasksByDate<T extends { due_date: string | null; done_at?: number | null }>(
  tasks: readonly T[],
  today: string
): TaskGroups<T> {
  const groups: TaskGroups<T> = { overdue: [], today: [], upcoming: [], undated: [] };
  for (const task of tasks) {
    if (task.done_at !== undefined && task.done_at !== null) continue;
    if (!task.due_date) {
      groups.undated.push(task);
    } else if (task.due_date < today) {
      groups.overdue.push(task);
    } else if (task.due_date === today) {
      groups.today.push(task);
    } else {
      groups.upcoming.push(task);
    }
  }
  return groups;
}

/** Geçerli HTTP/HTTPS bağlantısından www. hariç alan adını döndürür. */
export function extractDomain(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Panelin sağ altında geçici bildirim (toast) gösterir. */
export function showToast(message: string, kind: 'info' | 'error' = 'info'): void {
  if (typeof document === 'undefined' || !message) return;
  let el = document.getElementById('panel-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'panel-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.append(el);
  }
  el.textContent = message;
  el.className = `toast panel-toast${kind === 'error' ? ' danger' : ''}`;
  el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (el) el.hidden = true;
  }, 2800);
}

/** Yıkıcı eylemler için "ikinci tık" onay deseni. İlk tıkta metin değişir, ikinci tıkta çalıştırılır. */
export function confirmSecondClick(
  button: HTMLButtonElement,
  onConfirm: () => void | Promise<void>,
  confirmLabel = 'Emin misin?',
  timeoutMs = 3000
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let armed = false;
  let originalText = button.textContent ?? '';

  const reset = (): void => {
    if (!armed) return;
    armed = false;
    if (timer) clearTimeout(timer);
    button.textContent = originalText;
    button.classList.remove('confirming');
  };

  button.addEventListener('click', event => {
    event.stopPropagation();
    if (!armed) {
      originalText = button.textContent ?? '';
      armed = true;
      button.textContent = confirmLabel;
      button.classList.add('confirming');
      timer = setTimeout(reset, timeoutMs);
      return;
    }
    reset();
    void onConfirm();
  });
}

let kebabListenersBound = false;

function closeAllKebabMenus(except?: HTMLElement): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll<HTMLElement>('.kebab-menu.open').forEach(menu => {
    if (menu === except) return;
    menu.classList.remove('open');
    const trigger = menu.querySelector<HTMLButtonElement>('.kebab-trigger');
    const popover = menu.querySelector<HTMLElement>('.kebab-popover');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (popover) popover.hidden = true;
    menu.querySelectorAll<HTMLButtonElement>('.kebab-item[data-original-label]').forEach(btn => {
      btn.dataset.armed = 'false';
      const labelSpan = btn.querySelector('.kebab-item-label');
      if (labelSpan && btn.dataset.originalLabel) labelSpan.textContent = btn.dataset.originalLabel;
      btn.classList.remove('confirming');
    });
  });
}

function ensureKebabGlobalListeners(): void {
  if (kebabListenersBound || typeof document === 'undefined') return;
  kebabListenersBound = true;
  document.addEventListener('click', () => closeAllKebabMenus());
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeAllKebabMenus();
  });
}

/** Satır içi ikincil eylemler için "⋯" açılır menü üretir. */
export function createKebabMenu(items: readonly KebabMenuItem[], ariaLabel = 'İşlemler'): HTMLElement {
  ensureKebabGlobalListeners();

  const wrap = document.createElement('div');
  wrap.className = 'kebab-menu';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'icon-button kebab-trigger';
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', ariaLabel);
  trigger.title = ariaLabel;
  trigger.append(icon('ellipsis', 16));

  const popover = document.createElement('div');
  popover.className = 'kebab-popover card';
  popover.setAttribute('role', 'menu');
  popover.hidden = true;

  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `kebab-item${item.danger ? ' danger' : ''}`;
    btn.setAttribute('role', 'menuitem');
    btn.dataset.originalLabel = item.label;
    btn.dataset.armed = 'false';

    if (item.icon) btn.append(icon(item.icon, 14));
    const span = document.createElement('span');
    span.className = 'kebab-item-label';
    span.textContent = item.label;
    btn.append(span);

    let timer: ReturnType<typeof setTimeout> | undefined;
    btn.addEventListener('click', event => {
      event.stopPropagation();
      if (item.confirm && btn.dataset.armed !== 'true') {
        btn.dataset.armed = 'true';
        span.textContent = `${item.label} — Emin misin?`;
        btn.classList.add('confirming');
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          btn.dataset.armed = 'false';
          span.textContent = item.label;
          btn.classList.remove('confirming');
        }, 3000);
        return;
      }
      if (timer) clearTimeout(timer);
      closeAllKebabMenus();
      void item.onSelect();
    });

    popover.append(btn);
  }

  trigger.addEventListener('click', event => {
    event.stopPropagation();
    const isOpen = wrap.classList.contains('open');
    closeAllKebabMenus(wrap);
    if (isOpen) {
      wrap.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      popover.hidden = true;
    } else {
      wrap.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      popover.hidden = false;
    }
  });

  wrap.append(trigger, popover);
  return wrap;
}

/** Boş liste durumu bileşeni (ikon + başlık + ipucu + isteğe bağlı eylem düğmesi). */
export function createEmptyState(options: EmptyStateOptions): HTMLElement {
  const box = document.createElement('div');
  box.className = 'empty-state';
  if (options.icon) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'empty-icon';
    iconWrap.append(icon(options.icon, 24));
    box.append(iconWrap);
  }
  const title = document.createElement('p');
  title.className = 'empty-title';
  title.textContent = options.title;
  box.append(title);

  if (options.hint) {
    const hint = document.createElement('p');
    hint.className = 'empty-hint muted';
    hint.textContent = options.hint;
    box.append(hint);
  }

  if (options.actionLabel && options.onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'primary empty-action';
    btn.textContent = options.actionLabel;
    btn.addEventListener('click', options.onAction);
    box.append(btn);
  }

  return box;
}

/** Standart liste satırı bileşeni. */
export function createListRow(options: ListRowOptions): HTMLLIElement {
  const li = document.createElement('li');
  li.className = `list-row${options.className ? ` ${options.className}` : ''}${options.onClick ? ' clickable' : ''}`;

  if (options.leading) {
    const lead = document.createElement('div');
    lead.className = 'list-row-leading';
    lead.append(options.leading);
    li.append(lead);
  }

  const body = document.createElement('div');
  body.className = 'list-row-content';
  body.append(options.content);
  li.append(body);

  if (options.meta) {
    const meta = document.createElement('div');
    meta.className = 'list-row-meta';
    meta.append(options.meta);
    li.append(meta);
  }

  if (options.actions) {
    const actions = document.createElement('div');
    actions.className = 'list-row-actions';
    actions.append(options.actions);
    li.append(actions);
  }

  if (options.onClick) {
    li.addEventListener('click', event => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select, label, .kebab-menu, .inline-editor')) return;
      options.onClick!();
    });
  }

  return li;
}
