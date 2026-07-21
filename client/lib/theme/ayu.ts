/** Electron/main needs concrete hex; keep in sync with --ayu-* in globals.css */
export const AYU_THEME = {
  dark: {
    uiBg: "#0d1017",
    editorBg: "#10141c",
    panel: "#141821",
    fg: "#e6e1cf",
  },
  light: {
    uiBg: "#f8f9fa",
    editorBg: "#fcfcfc",
    panel: "#fafafa",
    fg: "#5c6166",
  },
} as const;

export type AppTheme = keyof typeof AYU_THEME;

export const windowBackgroundForTheme = (theme: AppTheme): string =>
  theme === "light" ? AYU_THEME.light.editorBg : AYU_THEME.dark.uiBg;
