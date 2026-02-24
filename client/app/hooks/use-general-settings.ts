import { useCallback, useEffect, useState } from 'react'

import {
  DEFAULT_GENERAL_SETTINGS,
  GENERAL_SETTINGS_CHANGE_EVENT,
  type GeneralSettingsState,
} from '@/lib/storage/general-settings'
import {
  loadGeneralSettings,
  saveGeneralSettings,
  updateGeneralSetting as storeUpdateGeneralSetting,
  resetGeneralSettings as storeResetGeneralSettings,
} from '@/lib/storage/general-settings-client'

type GeneralSettingKey = keyof GeneralSettingsState

export function useGeneralSettings() {
  const [settings, setSettings] = useState<GeneralSettingsState>({ ...DEFAULT_GENERAL_SETTINGS })

  useEffect(() => {
    let isActive = true

    const sync = () => {
      void loadGeneralSettings().then((next) => {
        if (isActive) {
          setSettings(next)
        }
      })
    }

    sync()
    window.addEventListener(GENERAL_SETTINGS_CHANGE_EVENT, sync)

    return () => {
      isActive = false
      window.removeEventListener(GENERAL_SETTINGS_CHANGE_EVENT, sync)
    }
  }, [])

  const updateSetting = useCallback(<K extends GeneralSettingKey>(key: K, value: GeneralSettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    void storeUpdateGeneralSetting(key, value)
  }, [])

  const setAllSettings = useCallback((nextSettings: GeneralSettingsState) => {
    setSettings(nextSettings)
    void saveGeneralSettings(nextSettings)
  }, [])

  const resetSettings = useCallback(() => {
    void storeResetGeneralSettings().then((next) => setSettings(next))
  }, [])

  return {
    settings,
    updateSetting,
    setAllSettings,
    resetSettings,
  } as const
}
