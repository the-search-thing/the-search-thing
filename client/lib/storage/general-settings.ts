export type SearchScopeSetting = "both" | "files" | "folders";
export type FontSetting = "sans-serif" | "mono";
export type ThemeSetting = "dark" | "light";
export type WindowPlacementSetting = "center" | "center-above" | "center-below" | "cursor";

export type GeneralSettingsState = {
  "launch-on-startup": boolean;
  theme: ThemeSetting;
  font: FontSetting;
  scope: SearchScopeSetting;
  "window-placement": WindowPlacementSetting;
};

export const DEFAULT_GENERAL_SETTINGS: GeneralSettingsState = {
  "launch-on-startup": true,
  theme: "dark",
  font: "sans-serif",
  scope: "both",
  "window-placement": "center",
};

export const GENERAL_SETTINGS_CHANGE_EVENT = "general-settings:change";
