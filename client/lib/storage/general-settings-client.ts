import {
  DEFAULT_GENERAL_SETTINGS,
  GENERAL_SETTINGS_CHANGE_EVENT,
  type GeneralSettingsState,
} from './general-settings'

type PersistedGeneralSettingKey = keyof GeneralSettingsState

type GeneralSettingsApi = {
  getGeneralSettings: () => Promise<GeneralSettingsState>
  setGeneralSettings: (settings: GeneralSettingsState) => Promise<GeneralSettingsState>
  updateGeneralSetting: (
    key: PersistedGeneralSettingKey,
    value: GeneralSettingsState[PersistedGeneralSettingKey]
  ) => Promise<GeneralSettingsState>
  resetGeneralSettings: () => Promise<GeneralSettingsState>
}

const getGeneralSettingsApi = (): GeneralSettingsApi => {
  return window.conveyor.generalSettings as GeneralSettingsApi
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
