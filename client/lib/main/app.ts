import { BrowserWindow, shell, app } from 'electron'
import { join } from 'path'
import appIcon from '@/resources/build/logo-white-bg.webp'
import { registerResourcesProtocol } from './protocols'
import { registerWindowHandlers } from '@/lib/conveyor/handlers/window-handler'
import { registerAppHandlers } from '@/lib/conveyor/handlers/app-handler'
import { registerSearchHandlers } from '@/lib/conveyor/handlers/search-handler'

let mainWindow: BrowserWindow | null = null

export function getMainWindow() {
  return mainWindow
}

export function createAppWindow(): BrowserWindow {
  // Register custom protocol for resources
  registerResourcesProtocol()

  // Create the main window.
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

  // Register IPC events for the main window.
  registerWindowHandlers(mainWindow)
  registerAppHandlers(app)
  registerSearchHandlers()

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
