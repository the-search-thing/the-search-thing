import { electronAPI } from '@electron-toolkit/preload'
import { AppApi } from './app-api'
import { WindowApi } from './window-api'
import { SearchApi } from './search-api'
import { KeybindsApi } from './keybinds-api'
import { GeneralSettingsApi } from './general-settings-api'

export const conveyor = {
  app: new AppApi(electronAPI),
  window: new WindowApi(electronAPI),
  search: new SearchApi(electronAPI),
  keybinds: new KeybindsApi(electronAPI),
  generalSettings: new GeneralSettingsApi(electronAPI),
}

export type ConveyorApi = typeof conveyor
