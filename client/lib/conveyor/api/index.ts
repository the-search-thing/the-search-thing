import { electronAPI } from '@electron-toolkit/preload'
import { AppApi } from './app-api'
import { WindowApi } from './window-api'
import { SearchApi } from './search-api'

export const conveyor = {
  app: new AppApi(electronAPI),
  window: new WindowApi(electronAPI),
  search: new SearchApi(electronAPI),
}

export type ConveyorApi = typeof conveyor
