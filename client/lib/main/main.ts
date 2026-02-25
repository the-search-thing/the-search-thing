import { app, BrowserWindow, globalShortcut } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { join } from 'path'
import { createAppWindow, getMainWindow, initializeApp, positionAppWindow } from './app'
import { createBetterSqliteAdapter } from '@/lib/storage/sqlite-adapter'
import { createKeybindsStore } from '@/lib/storage/keybinds-db-store'
import type { KeyCombo, KeybindMap } from '@/lib/storage/keybind-store'

let keybindsStore: ReturnType<typeof createKeybindsStore> | null = null
let currentToggleShortcut: string | null = null

const getKeybindsStore = () => {
  if (keybindsStore) {
    return keybindsStore
  }

  const dbPath = join(app.getPath('userData'), 'keybinds.db')
  const adapter = createBetterSqliteAdapter(dbPath)
  keybindsStore = createKeybindsStore(adapter)
  keybindsStore.init()

  return keybindsStore
}

const normalizeAcceleratorKey = (key: string): string => {
  if (key === ' ') return 'Space'
  const normalized = key.toLowerCase()
  if (normalized === 'space') return 'Space'
  if (normalized === 'arrowup') return 'Up'
  if (normalized === 'arrowdown') return 'Down'
  if (normalized === 'arrowleft') return 'Left'
  if (normalized === 'arrowright') return 'Right'
  if (normalized === 'escape') return 'Esc'
  if (normalized === 'enter') return 'Enter'
  if (normalized === 'tab') return 'Tab'
  return normalized.length === 1 ? normalized.toUpperCase() : normalized
}

const comboToAccelerator = (combo: KeyCombo): string | null => {
  const parts: string[] = []
  if (combo.ctrlKey) parts.push('Ctrl')
  if (combo.altKey) parts.push('Alt')
  if (combo.shiftKey) parts.push('Shift')
  if (combo.metaKey) parts.push(process.platform === 'darwin' ? 'Command' : 'Super')

  const key = normalizeAcceleratorKey(combo.key)
  if (!key) return null
  parts.push(key)
  return parts.join('+')
}

const toggleAppWindow = () => {
  const win = getMainWindow() ?? createAppWindow()
  if (win.isVisible()) {
    win.hide()
  } else {
    positionAppWindow(win)
    win.show()
    win.focus()
  }
}

const registerToggleShortcut = (combo: KeyCombo) => {
  const accelerator = comboToAccelerator(combo)
  if (!accelerator) return

  if (currentToggleShortcut) {
    globalShortcut.unregister(currentToggleShortcut)
  }

  const success = globalShortcut.register(accelerator, toggleAppWindow)
  if (!success) {
    console.warn(`Failed to register global shortcut: ${accelerator}`)
    return
  }

  currentToggleShortcut = accelerator
}

const handleKeybindsChange = (map: KeybindMap) => {
  registerToggleShortcut(map['toggle-app'])
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')
  await startBackend()
  // Register IPC handlers and custom protocols once, before any window is created.
  // This must not be called again — ipcMain.handle() throws on duplicate registrations.
  initializeApp({
    onKeybindsChange: handleKeybindsChange,
    onGeneralSettingsChange: () => {
      const win = getMainWindow()
      if (win) {
        positionAppWindow(win)
      }
    },
  })
  // Create app window
  createAppWindow()

  const initialKeybinds = getKeybindsStore().getKeybinds()
  handleKeybindsChange(initialKeybinds)
  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createAppWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  keybindsStore?.close?.()
  stopBackend()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file, you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
