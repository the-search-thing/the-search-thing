export type ThemeSetting = 'dark' | 'light'
export type SearchScopeSetting = 'both' | 'files' | 'folders'
export type FontSetting = 'sans-serif' | 'serif' | 'mono'

export type GeneralSettingKey =
  | 'launch-on-startup'
  | 'theme'
  | 'font'
  | 'scope'
  | 'clear-search'

export type GeneralSettingsState = {
  'launch-on-startup': boolean
  theme: ThemeSetting
  font: FontSetting
  scope: SearchScopeSetting
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettingsState = {
  'launch-on-startup': true,
  theme: 'dark',
  font: 'sans-serif',
  scope: 'both',
}

export const GENERAL_SETTINGS_CHANGE_EVENT = 'general-settings:change'


// current general settings actions
export type GeneralMeta = {
  action: GeneralSettingKey
  label: string
  description: string
}

// all keybind actions right now
export const SETTINGS_ACTIONS: GeneralMeta[] = [
  { action: 'launch-on-startup', label: 'Launch at startup', description: 'Open the app when you sign in.' },
  { action: 'theme', label: 'Theme', description: 'Choose Light or Dark mode.' },
  { action: 'font', label: 'Font', description: 'Choose Sans-Serif, Serif or Mono.'},
  { action: 'scope', label: 'Search Scope', description: 'Files, Folders, or Both.' },
  { action: 'clear-search', label: 'Clear recent searches', description: 'Remove cached query history.'}
]

