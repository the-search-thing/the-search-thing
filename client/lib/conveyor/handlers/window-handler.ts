import type { BrowserWindow } from 'electron'
import { shell } from 'electron'
import { handle } from '@/lib/main/shared'
import { electronAPI } from '@electron-toolkit/preload'

export const registerWindowHandlers = (getWindow: () => BrowserWindow | null) => {
  // Window operations
  handle('window-init', () => {
    const window = getWindow()
    if (!window) throw new Error('No active window')

    const { width, height } = window.getBounds()
    const minimizable = window.isMinimizable()
    const maximizable = window.isMaximizable()
    const platform = electronAPI.process.platform

    return { width, height, minimizable, maximizable, platform }
  })

  handle('window-is-minimizable', () => getWindow()?.isMinimizable() ?? false)
  handle('window-is-maximizable', () => getWindow()?.isMaximizable() ?? false)
  handle('window-minimize', () => getWindow()?.minimize())
  handle('window-maximize', () => getWindow()?.maximize())
  handle('window-close', () => getWindow()?.close())
  handle('window-maximize-toggle', () => {
    const window = getWindow()
    if (!window) return
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  })

  // Web content operations
  handle('web-undo', () => getWindow()?.webContents.undo())
  handle('web-redo', () => getWindow()?.webContents.redo())
  handle('web-cut', () => getWindow()?.webContents.cut())
  handle('web-copy', () => getWindow()?.webContents.copy())
  handle('web-paste', () => getWindow()?.webContents.paste())
  handle('web-delete', () => getWindow()?.webContents.delete())
  handle('web-select-all', () => getWindow()?.webContents.selectAll())
  handle('web-reload', () => getWindow()?.webContents.reload())
  handle('web-force-reload', () => getWindow()?.webContents.reloadIgnoringCache())
  handle('web-toggle-devtools', () => getWindow()?.webContents.toggleDevTools())
  handle('web-actual-size', () => getWindow()?.webContents.setZoomLevel(0))
  handle('web-zoom-in', () => {
    const wc = getWindow()?.webContents
    if (!wc) return
    wc.setZoomLevel(wc.zoomLevel + 0.5)
  })
  handle('web-zoom-out', () => {
    const wc = getWindow()?.webContents
    if (!wc) return
    wc.setZoomLevel(wc.zoomLevel - 0.5)
  })
  handle('web-toggle-fullscreen', () => {
    const window = getWindow()
    if (!window) return
    window.setFullScreen(!window.fullScreen)
  })
  handle('web-open-url', (url: string) => shell.openExternal(url))
}
