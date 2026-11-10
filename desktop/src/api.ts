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

export interface PinnedWindow {
  hwnd: number;
  title: string;
  exe: string;
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

export interface Prefs {
  battery_notify: boolean;
  copy_only: boolean;
  picker_shortcut: string;
  snippets_shortcut: string;
  topmost_shortcut: string;
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
  snippetList: (query: string) => invoke<Snippet[]>('snippet_list', { query }),
  snippetSave: (id: number | null, trigger: string, title: string, body: string) =>
    invoke<number>('snippet_save', { id, trigger, title, body }),
  snippetDelete: (id: number) => invoke<void>('snippet_delete', { id }),
  snippetInsert: (id: number) => invoke<void>('snippet_insert', { id }),
  snippetPickerHide: () => invoke<void>('snippet_picker_hide'),
  prefsGet: () => invoke<Prefs>('prefs_get'),
  prefsSet: (prefs: Prefs) => invoke<void>('prefs_set', { prefs }),
  shortcutsSet: (picker: string, snippets: string, topmost: string) => invoke<void>('shortcuts_set', { picker, snippets, topmost }),
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
  updateInstall: () => invoke<void>('update_install'),
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
  windowsList: () => invoke<PinnedWindow[]>('windows_list'),
  windowsRelease: (hwnd: number) => invoke<PinnedWindow[]>('windows_release', { hwnd }),
  windowsReleaseAll: () => invoke<PinnedWindow[]>('windows_release_all'),
  pickerHide: () => invoke<void>('picker_hide'),
  elecGet: () => invoke<Electricity>('electricity_get'),
  elecSave: (data: Electricity) => invoke<void>('electricity_save', { data }),
  elecEstimate: (data: Electricity) => invoke<Estimate>('electricity_estimate', { data })
};

export function errText(e: unknown): string {
  return typeof e === 'string' ? e : e instanceof Error ? e.message : String(e);
}
