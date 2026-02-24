import { app } from 'electron'
import { join } from 'path'
import { handle } from '@/lib/main/shared'
import { createBetterSqliteAdapter } from '@/lib/storage/sqlite-adapter'
import { createGeneralSettingsStore } from '@/lib/storage/general-settings-db-store'

const applyLaunchOnStartup = (enabled: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath('exe'),
    args: [],
    enabled: true,
    name: 'the-search-thing',
  })
}

let store: ReturnType<typeof createGeneralSettingsStore> | null = null

const getStore = () => {
  if (store) {
    return store
  }

  const dbPath = join(app.getPath('userData'), 'general-settings.db')
  const adapter = createBetterSqliteAdapter(dbPath)
  store = createGeneralSettingsStore(adapter)
  store.init()

  return store
}

export const registerGeneralSettingsHandlers = () => {
  const initialSettings = getStore().getGeneralSettings()
  applyLaunchOnStartup(initialSettings['launch-on-startup'])

  app.on('before-quit', () => {
    store?.close?.()
  })

  handle('general-settings/get', async () => {
    return getStore().getGeneralSettings()
  })

  handle('general-settings/set', async (settings) => {
    const next = getStore().setGeneralSettings(settings)
    applyLaunchOnStartup(next['launch-on-startup'])
    return next
  })

  handle('general-settings/update', async (key, value) => {
    const next = getStore().updateGeneralSetting(key, value)
    if (key === 'launch-on-startup') {
      applyLaunchOnStartup(next['launch-on-startup'])
    }
    return next
  })

  handle('general-settings/reset', async () => {
    const next = getStore().resetGeneralSettings()
    applyLaunchOnStartup(next['launch-on-startup'])
    return next
  })
}
