import { invoke } from '@tauri-apps/api/core';

export interface ClipItem {
  id: number;
  text: string;
  truncated: boolean;
  created_at: number;
  pinned: boolean;
}

export interface Settings {
  paused: boolean;
  expire_days: number;
  max_items: number;
  exclusions: string[];
}

export interface Component {
  name: string;
  watts: number;
}

export interface Electricity {
  components: Component[];
  hours: number;
  price: number | null;
}

export interface Estimate {
  daily_kwh: number;
  monthly_kwh: number;
  yearly_kwh: number;
  daily_tl: number;
  monthly_tl: number;
  yearly_tl: number;
}

export interface Snippet {
  id: number;
  trigger: string;
  title: string;
  body: string;
  use_count: number;
  created_at: number;
  updated_at: number;
}

export type NoteCategory = 'note' | 'read' | 'watch' | 'idea';

export interface Note {
  id: number;
  category: NoteCategory;
  text: string;
  url: string | null;
  page_title: string | null;
  user_note: string | null;
  created_at: number;
  updated_at: number;
  pinned: boolean;
  done_at: number | null;
  archived_at: number | null;
  remind_at: number | null;
  has_page: boolean;
  has_image: boolean;
}

export interface NoteCounts { all: number; note: number; read: number; watch: number; idea: number; archived: number }

export interface NotesPage {
  available: boolean;
  notes: Note[];
  counts: NoteCounts;
}

export type NoteSort = 'new' | 'old' | 'updated';
export interface NoteListOptions { archived: boolean; showDone: boolean; sort: NoteSort }

export interface Prefs {
  battery_notify: boolean;
  copy_only: boolean;
  picker_shortcut: string;
  snippets_shortcut: string;
  quicknote_shortcut: string;
  auto_update?: boolean;
}

export interface UpdateCheck {
  available: boolean;
  version?: string | null;
  notes?: string | null;
}

export interface ExtensionInfo {
  dir: string | null;
  version: string | null;
}

export interface DeviceBattery {
  id: string;
  name: string;
  kind: 'system' | 'bluetooth';
  percent: number;
  charging: boolean | null;
}

export interface DashboardSummary {
  tasks_available: boolean; notes_available: boolean; sites_available: boolean;
  open_count: number; overdue_count: number;
  today_tasks: { id: number; title: string; due: string }[];
  notes: { id: number; title: string; updated_at: number }[];
  sites: { domain: string; seconds: number }[];
  clipboard: { id: number; preview: string }[];
  batteries: DeviceBattery[]; ambient_playing: boolean; ambient_active_count: number;
}

export interface NativeStatus {
  registered: boolean;
  path_matches: boolean;
  manifest_path: string;
  exe_path: string;
  registered_exe: string | null;
}

export interface VideoToolsStatus { ytdlp: { installed: boolean; version: string | null }; ffmpeg: boolean; installing: boolean; folder: string; error: string | null }
export interface VideoJob { id: string; url: string; mode: string; pid: number; started_at: number; output_dir: string; cancelled: boolean; state: 'running' | 'done' | 'error' | 'cancelled'; percent: string | null; speed: string | null; eta: string | null; file: string | null; error: string | null }

export interface AmbientPreset {
  id: number;
  name: string;
  config_json: string;
  updated_at: number;
}

export const api = {
  videoToolsStatus: () => invoke<VideoToolsStatus>('video_tools_status'),
  videoToolsInstall: () => invoke<void>('video_tools_install'),
  videoToolsUpdate: () => invoke<void>('video_tools_update'),
  videoOpenFolder: () => invoke<void>('video_open_folder'),
  videoDownload: (url: string, mode: string) => invoke<string>('video_download', { url, mode }),
  videoJob: (jobId: string) => invoke<VideoJob>('video_job', { jobId }),
  videoJobs: () => invoke<VideoJob[]>('video_jobs'),
  videoCancel: (jobId: string) => invoke<void>('video_cancel', { jobId }),
  dashboardSummary: () => invoke<DashboardSummary>('dashboard_summary'),
  noteList: (category: string, query: string, o: NoteListOptions) =>
    invoke<NotesPage>('note_list', { category, query, archived: o.archived, showDone: o.showDone, sort: o.sort }),
  noteSetText: (id: number, text: string) => invoke<void>('note_set_text', { id, text }),
  noteSetCategory: (id: number, category: NoteCategory) => invoke<void>('note_set_category', { id, category }),
  noteSetPinned: (id: number, pinned: boolean) => invoke<void>('note_set_pinned', { id, pinned }),
  noteSetDone: (id: number, done: boolean) => invoke<void>('note_set_done', { id, done }),
  noteSetArchived: (id: number, archived: boolean) => invoke<void>('note_set_archived', { id, archived }),
  noteSetReminder: (id: number, remindAt: number | null) => invoke<void>('note_set_reminder', { id, remindAt }),
  noteImage: (id: number) => invoke<string | null>('note_image', { id }),
  notePage: (id: number) => invoke<{ text: string; saved_at: number } | null>('note_page', { id }),
  quicknoteAdd: (category: NoteCategory, text: string) => invoke<void>('quicknote_add', { category, text }),
  quicknoteHide: () => invoke<void>('quicknote_hide'),
  noteAdd: (category: NoteCategory, text: string, url: string | null, userNote: string | null) =>
    invoke<number>('note_add', { category, text, url, userNote }),
  noteUpdate: (id: number, category: NoteCategory, text: string, userNote: string | null) =>
    invoke<void>('note_update', { id, category, text, userNote }),
  noteDelete: (id: number) => invoke<void>('note_delete', { id }),
  noteOpenUrl: (url: string) => invoke<void>('note_open_url', { url }),
  snippetList: (query: string) => invoke<Snippet[]>('snippet_list', { query }),
  snippetSave: (id: number | null, trigger: string, title: string, body: string) =>
    invoke<number>('snippet_save', { id, trigger, title, body }),
  snippetDelete: (id: number) => invoke<void>('snippet_delete', { id }),
  snippetInsert: (id: number) => invoke<void>('snippet_insert', { id }),
  snippetPickerHide: () => invoke<void>('snippet_picker_hide'),
  prefsGet: () => invoke<Prefs>('prefs_get'),
  prefsSet: (prefs: Prefs) => invoke<void>('prefs_set', { prefs }),
  shortcutsSet: (picker: string, snippets: string, quicknote: string) => invoke<void>('shortcuts_set', { picker, snippets, quicknote }),
  batteryList: () => invoke<DeviceBattery[]>('battery_list'),
  presetList: () => invoke<AmbientPreset[]>('ambient_preset_list'),
  presetSave: (name: string, configJson: string) =>
    invoke<number>('ambient_preset_save', { name, configJson }),
  presetDelete: (id: number) => invoke<void>('ambient_preset_delete', { id }),
  ambientLastGet: () => invoke<string | null>('ambient_last_get'),
  ambientLastSet: (configJson: string) => invoke<void>('ambient_last_set', { configJson }),
  nativeStatus: () => invoke<NativeStatus>('native_status'),
  nativeRegister: () => invoke<NativeStatus>('native_register'),
  nativeUnregister: () => invoke<NativeStatus>('native_unregister'),
  updateCheck: () => invoke<UpdateCheck>('update_check'),
  updateInstall: () => invoke<'installed' | 'up_to_date' | 'postponed'>('update_install'),
  autoUpdateGet: () => invoke<boolean>('get_auto_update'),
  autoUpdateSet: (enabled: boolean) => invoke<boolean>('set_auto_update', { enabled }),
  extensionInfo: () => invoke<ExtensionInfo>('extension_info'),
  extensionOpenFolder: () => invoke<void>('extension_open_folder'),
  toast: (message: string) => invoke<void>('toast_show', { message }),
  clipList: (query: string) => invoke<ClipItem[]>('clipboard_list', { query }),
  clipCopy: (id: number) => invoke<void>('clipboard_copy', { id }),
  clipPin: (id: number, pinned: boolean) => invoke<void>('clipboard_pin', { id, pinned }),
  clipDelete: (id: number) => invoke<void>('clipboard_delete', { id }),
  clipClear: () => invoke<number>('clipboard_clear'),
  getSetting: (key: string) => invoke<string | null>('get_setting', { key }),
  setSetting: (key: string, value: string) => invoke<void>('set_setting', { key, value }),
  settingsGet: () => invoke<Settings>('settings_get'),
  settingsSet: (settings: Settings) => invoke<Settings>('settings_set', { settings }),
  autostartGet: () => invoke<boolean>('autostart_get'),
  autostartSet: (enabled: boolean) => invoke<boolean>('autostart_set', { enabled }),
  pickerHide: () => invoke<void>('picker_hide'),
  elecGet: () => invoke<Electricity>('electricity_get'),
  elecSave: (data: Electricity) => invoke<void>('electricity_save', { data }),
  elecEstimate: (data: Electricity) => invoke<Estimate>('electricity_estimate', { data })
};

export function errText(e: unknown): string {
  return typeof e === 'string' ? e : e instanceof Error ? e.message : String(e);
}
