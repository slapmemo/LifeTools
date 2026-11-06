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
}

export interface DeviceBattery {
  id: string;
  name: string;
  kind: 'system' | 'bluetooth';
  percent: number;
  charging: boolean | null;
}

export interface AmbientPreset {
  id: number;
  name: string;
  config_json: string;
  updated_at: number;
}

export const api = {
  snippetList: (query: string) => invoke<Snippet[]>('snippet_list', { query }),
  snippetSave: (id: number | null, trigger: string, title: string, body: string) =>
    invoke<number>('snippet_save', { id, trigger, title, body }),
  snippetDelete: (id: number) => invoke<void>('snippet_delete', { id }),
  snippetInsert: (id: number) => invoke<void>('snippet_insert', { id }),
  snippetPickerHide: () => invoke<void>('snippet_picker_hide'),
  prefsGet: () => invoke<Prefs>('prefs_get'),
  prefsSet: (prefs: Prefs) => invoke<void>('prefs_set', { prefs }),
  batteryList: () => invoke<DeviceBattery[]>('battery_list'),
  presetList: () => invoke<AmbientPreset[]>('ambient_preset_list'),
  presetSave: (name: string, configJson: string) =>
    invoke<number>('ambient_preset_save', { name, configJson }),
  presetDelete: (id: number) => invoke<void>('ambient_preset_delete', { id }),
  ambientLastGet: () => invoke<string | null>('ambient_last_get'),
  ambientLastSet: (configJson: string) => invoke<void>('ambient_last_set', { configJson }),
  toast: (message: string) => invoke<void>('toast_show', { message }),
  clipList: (query: string) => invoke<ClipItem[]>('clipboard_list', { query }),
  clipCopy: (id: number) => invoke<void>('clipboard_copy', { id }),
  clipPin: (id: number, pinned: boolean) => invoke<void>('clipboard_pin', { id, pinned }),
  clipDelete: (id: number) => invoke<void>('clipboard_delete', { id }),
  clipClear: () => invoke<number>('clipboard_clear'),
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
