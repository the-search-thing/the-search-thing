import type { BrowserWindow } from "electron";
import { shell } from "electron";
import { handle } from "@/lib/main/shared";
import type { WindowPlacementSetting } from "@/lib/storage/general-settings";
import { electronAPI } from "@electron-toolkit/preload";

export const registerWindowHandlers = (
  getWindow: () => BrowserWindow | null,
  applyPlacement?: (window: BrowserWindow, placement: WindowPlacementSetting) => void,
) => {
  // Window operations
  handle("window-init", () => {
    const window = getWindow();
    if (!window) throw new Error("No active window");

    const { width, height } = window.getBounds();
    const minimizable = window.isMinimizable();
    const maximizable = window.isMaximizable();
    const platform = electronAPI.process.platform;

    return { width, height, minimizable, maximizable, platform };
  });
  handle("window-close", () => getWindow()?.close());

  handle("window-apply-placement", (placement) => {
    const window = getWindow();
    if (!window) return;
    applyPlacement?.(window, placement);
  });

  // Web content operations
  handle("web-undo", () => getWindow()?.webContents.undo());
  handle("web-redo", () => getWindow()?.webContents.redo());
  handle("web-cut", () => getWindow()?.webContents.cut());
  handle("web-copy", () => getWindow()?.webContents.copy());
  handle("web-paste", () => getWindow()?.webContents.paste());
  handle("web-delete", () => getWindow()?.webContents.delete());
  handle("web-select-all", () => getWindow()?.webContents.selectAll());
  handle("web-open-url", (url: string) => shell.openExternal(url));
};
