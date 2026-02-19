import { BrowserWindow, app } from 'electron'
import { join } from 'path'
import appIcon from '@/resources/build/logo-white-bg.webp'
import { registerResourcesProtocol } from './protocols'
import { registerWindowHandlers } from '@/lib/conveyor/handlers/window-handler'
import { registerAppHandlers } from '@/lib/conveyor/handlers/app-handler'
import { registerSearchHandlers } from '@/lib/conveyor/handlers/search-handler'
import { registerSearchHistoryHandlers } from '@/lib/conveyor/handlers/search-history-handler'
import { registerKeybindsHandlers } from '@/lib/conveyor/handlers/keybinds-handler'

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/**
 * One-time initialization of IPC handlers and protocol registration.
 * Must be called once after app.whenReady() resolves, before any window is created.
 * Calling this more than once will throw because ipcMain.handle() and
 * protocol.handle() do not allow duplicate channel registrations.
 */
export function initializeApp(): void {
  registerResourcesProtocol()
  registerWindowHandlers(getMainWindow)
  registerAppHandlers(app)
  registerSearchHandlers()
  registerSearchHistoryHandlers()
  registerKeybindsHandlers()
}

/**
 * Creates (or re-creates) the main application window.
 * IPC handlers and protocol registration are NOT performed here — call
 * initializeApp() once at startup instead.
 */
export function createAppWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 470,
    show: false,
    backgroundColor: '#1c1c1c',
    icon: appIcon,
    frame: false,
    titleBarStyle: 'hiddenInset',
    title: 'Electron React App',
    maximizable: false,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}
