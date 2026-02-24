import type { SqliteAdapter } from './sqlite-adapter'
import {
  DEFAULT_GENERAL_SETTINGS,
  GENERAL_SETTINGS_CHANGE_EVENT,
  type FontSetting,
  type GeneralSettingsState,
  type SearchScopeSetting,
  type ThemeSetting,
} from './general-settings'

type PersistedGeneralSettingKey = keyof GeneralSettingsState

type GeneralSettingsRow = {
  setting_key: PersistedGeneralSettingKey
  setting_value: string
}

type GeneralSettingsApi = {
  getGeneralSettings: () => Promise<GeneralSettingsState>
  setGeneralSettings: (settings: GeneralSettingsState) => Promise<GeneralSettingsState>
  updateGeneralSetting: (
    key: PersistedGeneralSettingKey,
    value: GeneralSettingsState[PersistedGeneralSettingKey]
  ) => Promise<GeneralSettingsState>
  resetGeneralSettings: () => Promise<GeneralSettingsState>
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS general_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL
);
`

const getGeneralSettingsApi = (): GeneralSettingsApi => {
  return (window.conveyor as any).generalSettings as GeneralSettingsApi
}

const parseBoolean = (value: string, fallback: boolean): boolean => {
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return fallback
}

const parseTheme = (value: string, fallback: ThemeSetting): ThemeSetting => {
  return value === 'dark' || value === 'light' ? value : fallback
}

const parseFont = (value: string, fallback: FontSetting): FontSetting => {
  return value === 'sans-serif' || value === 'serif' || value === 'mono' ? value : fallback
}

const parseScope = (value: string, fallback: SearchScopeSetting): SearchScopeSetting => {
  return value === 'both' || value === 'files' || value === 'folders' ? value : fallback
}

const valueToStorage = (value: GeneralSettingsState[PersistedGeneralSettingKey]): string => {
  return typeof value === 'boolean' ? String(value) : value
}

const coerceValue = <K extends PersistedGeneralSettingKey>(
  key: K,
  rawValue: string,
  fallback: GeneralSettingsState[K]
): GeneralSettingsState[K] => {
  if (key === 'launch-on-startup') {
    return parseBoolean(rawValue, fallback as boolean) as GeneralSettingsState[K]
  }
  if (key === 'theme') {
    return parseTheme(rawValue, fallback as ThemeSetting) as GeneralSettingsState[K]
  }
  if (key === 'font') {
    return parseFont(rawValue, fallback as FontSetting) as GeneralSettingsState[K]
  }

  return parseScope(rawValue, fallback as SearchScopeSetting) as GeneralSettingsState[K]
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

export const loadGeneralSettings = async (): Promise<GeneralSettingsState> => {
  try {
    return await getGeneralSettingsApi().getGeneralSettings()
  } catch (error) {
    console.error('Failed to load general settings from DB:', error)
    return { ...DEFAULT_GENERAL_SETTINGS }
  }
}

export const saveGeneralSettings = async (settings: GeneralSettingsState): Promise<GeneralSettingsState> => {
  const result = await getGeneralSettingsApi().setGeneralSettings(settings)
  window.dispatchEvent(new CustomEvent(GENERAL_SETTINGS_CHANGE_EVENT))
  return result
}

export const updateGeneralSetting = async <K extends PersistedGeneralSettingKey>(
  key: K,
  value: GeneralSettingsState[K]
): Promise<GeneralSettingsState> => {
  const result = await getGeneralSettingsApi().updateGeneralSetting(key, value)
  window.dispatchEvent(new CustomEvent(GENERAL_SETTINGS_CHANGE_EVENT))
  return result
}

export const resetGeneralSettings = async (): Promise<GeneralSettingsState> => {
  const result = await getGeneralSettingsApi().resetGeneralSettings()
  window.dispatchEvent(new CustomEvent(GENERAL_SETTINGS_CHANGE_EVENT))
  return result
}

export const createGeneralSettingsStore = (adapter: SqliteAdapter) => {
  const init = () => {
    adapter.exec(schemaSql)
  }

  const getGeneralSettings = (): GeneralSettingsState => {
    const rows = adapter.all<GeneralSettingsRow>('SELECT setting_key, setting_value FROM general_settings')
    const settings: GeneralSettingsState = { ...DEFAULT_GENERAL_SETTINGS }

    for (const row of rows) {
      if (!(row.setting_key in settings)) {
        continue
      }

      const key = row.setting_key as PersistedGeneralSettingKey
      settings[key] = coerceValue(key, row.setting_value, settings[key])
    }

    return settings
  }

  const setGeneralSettings = (settings: GeneralSettingsState): GeneralSettingsState => {
    adapter.exec('DELETE FROM general_settings')

    for (const [key, value] of Object.entries(settings) as [
      PersistedGeneralSettingKey,
      GeneralSettingsState[PersistedGeneralSettingKey],
    ][]) {
      runUpsert(adapter, key, value)
    }

    return getGeneralSettings()
  }

  const updateGeneralSettingValue = <K extends PersistedGeneralSettingKey>(
    key: K,
    value: GeneralSettingsState[K]
  ): GeneralSettingsState => {
    runUpsert(adapter, key, value)
    return getGeneralSettings()
  }

  const resetGeneralSettingsValues = (): GeneralSettingsState => {
    adapter.exec('DELETE FROM general_settings')
    return { ...DEFAULT_GENERAL_SETTINGS }
  }

  return {
    init,
    getGeneralSettings,
    setGeneralSettings,
    updateGeneralSetting: updateGeneralSettingValue,
    resetGeneralSettings: resetGeneralSettingsValues,
    close: () => adapter.close(),
  }
}
