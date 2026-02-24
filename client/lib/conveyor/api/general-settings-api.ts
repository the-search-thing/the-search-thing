import { ConveyorApi } from '@/lib/preload/shared'
import type { GeneralSettingsState } from '@/lib/storage/general-settings'

type PersistedGeneralSettingKey = keyof GeneralSettingsState

export class GeneralSettingsApi extends ConveyorApi {
  getGeneralSettings = () => this.invoke('general-settings/get')
  setGeneralSettings = (settings: GeneralSettingsState) => this.invoke('general-settings/set', settings)
  updateGeneralSetting = <K extends PersistedGeneralSettingKey>(
    key: K,
    value: GeneralSettingsState[K]
  ) => this.invoke('general-settings/update', key, value)
  resetGeneralSettings = () => this.invoke('general-settings/reset')
}
