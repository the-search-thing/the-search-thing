import type { SqliteAdapter } from './sqlite-adapter'
import {
  DEFAULT_GENERAL_SETTINGS,
  type FontSetting,
  type GeneralSettingsState,
  type SearchScopeSetting,
  type ThemeSetting,
  type WindowPlacementSetting,
} from './general-settings'

type PersistedGeneralSettingKey = keyof GeneralSettingsState

type GeneralSettingsRow = {
  setting_key: PersistedGeneralSettingKey
  setting_value: string
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS general_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL
);
`

const parseBoolean = (value: string, fallback: boolean): boolean => {
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return fallback
}

const parseTheme = (value: string, fallback: ThemeSetting): ThemeSetting => {
  return value === 'dark' || value === 'light' ? value : fallback
}

const parseFont = (value: string, fallback: FontSetting): FontSetting => {
  return value === 'sans-serif' || value === 'mono' ? value : fallback
}

const parseScope = (value: string, fallback: SearchScopeSetting): SearchScopeSetting => {
  return value === 'both' || value === 'files' || value === 'folders' ? value : fallback
}

const parseWindowPlacement = (
  value: string,
  fallback: WindowPlacementSetting
): WindowPlacementSetting => {
  return value === 'center' || value === 'center-above' || value === 'center-below' || value === 'cursor'
    ? value
    : fallback
}

const valueToStorage = (value: GeneralSettingsState[PersistedGeneralSettingKey]): string => {
  return typeof value === 'boolean' ? String(value) : value
}

const runUpsert = (
  adapter: SqliteAdapter,
  key: PersistedGeneralSettingKey,
  value: GeneralSettingsState[PersistedGeneralSettingKey]
) => {
  adapter.run(
    `INSERT INTO general_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET
       setting_value = excluded.setting_value`,
    [key, valueToStorage(value)]
  )
}

export const createGeneralSettingsStore = (adapter: SqliteAdapter) => {
  const init = () => {
    adapter.exec(schemaSql)
  }

  const getGeneralSettings = (): GeneralSettingsState => {
    const rows = adapter.all<GeneralSettingsRow>('SELECT setting_key, setting_value FROM general_settings')
    const settings: GeneralSettingsState = { ...DEFAULT_GENERAL_SETTINGS }

    for (const row of rows) {
      switch (row.setting_key) {
        case 'launch-on-startup':
          settings['launch-on-startup'] = parseBoolean(
            row.setting_value,
            DEFAULT_GENERAL_SETTINGS['launch-on-startup']
          )
          break
        case 'theme':
          settings.theme = parseTheme(row.setting_value, DEFAULT_GENERAL_SETTINGS.theme)
          break
        case 'font':
          settings.font = parseFont(row.setting_value, DEFAULT_GENERAL_SETTINGS.font)
          break
        case 'scope':
          settings.scope = parseScope(row.setting_value, DEFAULT_GENERAL_SETTINGS.scope)
          break
        case 'window-placement':
          settings['window-placement'] = parseWindowPlacement(
            row.setting_value,
            DEFAULT_GENERAL_SETTINGS['window-placement']
          )
          break
      }
    }

    return settings
  }

  const setGeneralSettings = (settings: GeneralSettingsState): GeneralSettingsState => {
    for (const [key, value] of Object.entries(settings) as [
      PersistedGeneralSettingKey,
      GeneralSettingsState[PersistedGeneralSettingKey],
    ][]) {
      runUpsert(adapter, key, value)
    }

    return getGeneralSettings()
  }

  const updateGeneralSetting = <K extends PersistedGeneralSettingKey>(
    key: K,
    value: GeneralSettingsState[K]
  ): GeneralSettingsState => {
    runUpsert(adapter, key, value)
    return getGeneralSettings()
  }

  const resetGeneralSettings = (): GeneralSettingsState => {
    adapter.exec('DELETE FROM general_settings')
    return { ...DEFAULT_GENERAL_SETTINGS }
  }

  return {
    init,
    getGeneralSettings,
    setGeneralSettings,
    updateGeneralSetting,
    resetGeneralSettings,
    close: () => adapter.close(),
  }
}
