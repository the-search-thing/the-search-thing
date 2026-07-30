export type ThemeSetting = "dark" | "light";
export type SearchScopeSetting = "both" | "files" | "folders";
export type FontSetting = "sans-serif" | "mono";
export type WindowPlacementSetting = "center" | "center-above" | "center-below" | "cursor";
export type InputModeSetting = "normal" | "vim";
type GeneralSettingKey =
  | "launch-on-startup"
  | "theme"
  | "font"
  | "scope"
  | "window-placement"
  | "input-mode"
  | "clear-search";

export type GeneralSettingsState = {
  "launch-on-startup": boolean;
  theme: ThemeSetting;
  font: FontSetting;
  scope: SearchScopeSetting;
  "window-placement": WindowPlacementSetting;
  "input-mode": InputModeSetting;
};

export const DEFAULT_GENERAL_SETTINGS: GeneralSettingsState = {
  "launch-on-startup": true,
  theme: "dark",
  font: "sans-serif",
  scope: "both",
  "window-placement": "center",
  "input-mode": "normal",
};

export const GENERAL_SETTINGS_CHANGE_EVENT = "general-settings:change";

// current general settings actions
type GeneralMeta = {
  action: GeneralSettingKey;
  label: string;
  description: string;
};

// all keybind actions right now
const SETTINGS_ACTIONS: GeneralMeta[] = [
  {
    action: "launch-on-startup",
    label: "Launch at startup",
    description: "Open the app when you sign in.",
  },
  { action: "theme", label: "Theme", description: "Choose Light or Dark mode." },
  { action: "font", label: "Font", description: "Choose Sans-Serif or Mono." },
  { action: "scope", label: "Search Scope", description: "Files, Folders, or Both." },
  {
    action: "window-placement",
    label: "Window placement",
    description: "Choose where the window appears.",
  },
  {
    action: "input-mode",
    label: "Input mode",
    description: "Choose between normal and Vim navigation.",
  },
  {
    action: "clear-search",
    label: "Clear recent searches",
    description: "Remove cached query history.",
  },
];
