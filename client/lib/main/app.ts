import { BrowserWindow, app, screen } from "electron";
import { join } from "path";
import appIcon from "@/resources/build/logo-white-bg.webp";
import { registerResourcesProtocol } from "./protocols";
import { registerWindowHandlers } from "@/lib/conveyor/handlers/window-handler";
import { registerAppHandlers } from "@/lib/conveyor/handlers/app-handler";
import { registerSearchHandlers } from "@/lib/conveyor/handlers/search-handler";
import { registerSearchHistoryHandlers } from "@/lib/conveyor/handlers/search-history-handler";
import { registerKeybindsHandlers } from "@/lib/conveyor/handlers/keybinds-handler";
import { registerGeneralSettingsHandlers } from "@/lib/conveyor/handlers/general-settings-handler";
import { createBetterSqliteAdapter } from "@/lib/storage/sqlite-adapter";
import { createGeneralSettingsStore } from "@/lib/storage/general-settings-db-store";
import type { GeneralSettingsState, WindowPlacementSetting } from "@/lib/storage/general-settings";
import type { KeybindMap } from "@/lib/storage/keybind-store";
import { windowBackgroundForTheme, type AppTheme } from "@/lib/theme/ayu";

let mainWindow: BrowserWindow | null = null;
let generalSettingsStore: ReturnType<typeof createGeneralSettingsStore> | null = null;
let currentGeneralSettings: GeneralSettingsState | null = null;

// eventually move these outta here
const MIN_WINDOW_WIDTH = 400;
const MIN_WINDOW_HEIGHT = 600;
const WINDOW_WIDTH = 1200;
const WINDOW_HEIGHT = 800;
const WINDOW_PLACEMENT_OFFSET = 80;

const getGeneralSettingsStore = () => {
  if (generalSettingsStore) {
    return generalSettingsStore;
  }

  const dbPath = join(app.getPath("userData"), "general-settings.db");
  const adapter = createBetterSqliteAdapter(dbPath);
  generalSettingsStore = createGeneralSettingsStore(adapter);
  generalSettingsStore.init();

  return generalSettingsStore;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const computeWindowPositionForSize = (
  placement: WindowPlacementSetting,
  windowWidth: number,
  windowHeight: number,
) => {
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const { x, y, width, height } = display.workArea;
  const centerX = x + Math.round((width - windowWidth) / 2);
  const centerY = y + Math.round((height - windowHeight) / 2);

  let nextX = centerX;
  let nextY = centerY;

  if (placement === "center-above") {
    nextY = centerY - WINDOW_PLACEMENT_OFFSET;
  } else if (placement === "center-below") {
    nextY = centerY + WINDOW_PLACEMENT_OFFSET;
  } else if (placement === "cursor") {
    nextX = Math.round(cursorPoint.x - windowWidth / 2);
    nextY = Math.round(cursorPoint.y - windowHeight / 2);
  }

  const minX = x;
  const maxX = x + width - windowWidth;
  const minY = y;
  const maxY = y + height - windowHeight;

  return {
    x: clamp(nextX, minX, maxX),
    y: clamp(nextY, minY, maxY),
  };
};

const computeWindowBoundsForPlacement = (
  placement: WindowPlacementSetting,
  windowWidth: number,
  windowHeight: number,
) => {
  const position = computeWindowPositionForSize(placement, windowWidth, windowHeight);
  return { ...position, width: windowWidth, height: windowHeight };
};

const positionAppWindowWithPlacement = (
  window: BrowserWindow,
  placement: WindowPlacementSetting,
) => {
  if (window.isFullScreen() || window.isMaximized()) return;
  const { width, height } = window.getBounds();
  const bounds = computeWindowBoundsForPlacement(placement, width, height);
  window.setBounds(bounds, false);
};

export const positionAppWindow = (window: BrowserWindow) => {
  if (window.isFullScreen() || window.isMaximized()) return;
  window.center();
};

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/**
 * One-time initialization of IPC handlers and protocol registration.
 * Must be called once after app.whenReady() resolves, before any window is created.
 * Calling this more than once will throw because ipcMain.handle() and
 * protocol.handle() do not allow duplicate channel registrations.
 */
export function initializeApp(options?: {
  onKeybindsChange?: (map: KeybindMap) => void;
  onGeneralSettingsChange?: () => void;
}): void {
  registerResourcesProtocol();
  registerWindowHandlers(getMainWindow, positionAppWindowWithPlacement);
  registerAppHandlers(app);
  registerSearchHandlers();
  registerSearchHistoryHandlers();
  registerKeybindsHandlers(options?.onKeybindsChange);
  registerGeneralSettingsHandlers((settings) => {
    const previousTheme = currentGeneralSettings?.theme;
    currentGeneralSettings = settings;
    if (previousTheme !== undefined && previousTheme !== settings.theme) {
      getMainWindow()?.setBackgroundColor(windowBackgroundForTheme(settings.theme as AppTheme));
    }
    options?.onGeneralSettingsChange?.();
  });

  app.on("before-quit", () => {
    generalSettingsStore?.close?.();
  });
}

export function createAppWindow(): BrowserWindow {
  const initialTheme = (currentGeneralSettings?.theme ?? "dark") as AppTheme;
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    height: WINDOW_HEIGHT,
    show: false,
    center: true,
    backgroundColor: windowBackgroundForTheme(initialTheme),
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (!app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}
