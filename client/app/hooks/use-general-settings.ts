import { useCallback, useSyncExternalStore } from "react";

import {
  DEFAULT_GENERAL_SETTINGS,
  GENERAL_SETTINGS_CHANGE_EVENT,
  type GeneralSettingsState,
} from "@/lib/storage/general-settings";
import {
  loadGeneralSettings,
  saveGeneralSettings,
  updateGeneralSetting as storeUpdateGeneralSetting,
  resetGeneralSettings as storeResetGeneralSettings,
} from "@/lib/storage/general-settings-client";

type GeneralSettingKey = keyof GeneralSettingsState;
type Listener = () => void;

let cachedSettings: GeneralSettingsState = { ...DEFAULT_GENERAL_SETTINGS };
let loadPromise: Promise<GeneralSettingsState> | null = null;
const listeners = new Set<Listener>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

const setCachedSettings = (next: GeneralSettingsState) => {
  cachedSettings = next;
  emit();
};

const ensureLoaded = () => {
  if (loadPromise) return loadPromise;

  loadPromise = loadGeneralSettings()
    .then((next) => {
      setCachedSettings(next);
      return next;
    })
    .catch((error) => {
      loadPromise = null;
      throw error;
    });

  return loadPromise;
};

const subscribe = (listener: Listener) => {
  listeners.add(listener);
  void ensureLoaded();

  const onChange = () => {
    void loadGeneralSettings().then(setCachedSettings);
  };
  window.addEventListener(GENERAL_SETTINGS_CHANGE_EVENT, onChange);

  return () => {
    listeners.delete(listener);
    window.removeEventListener(GENERAL_SETTINGS_CHANGE_EVENT, onChange);
  };
};

const getSnapshot = () => cachedSettings;

export function useGeneralSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const updateSetting = useCallback(
    <K extends GeneralSettingKey>(key: K, value: GeneralSettingsState[K]) => {
      const next = { ...cachedSettings, [key]: value };
      setCachedSettings(next);
      void storeUpdateGeneralSetting(key, value);
    },
    [],
  );

  const setAllSettings = useCallback((nextSettings: GeneralSettingsState) => {
    setCachedSettings(nextSettings);
    void saveGeneralSettings(nextSettings);
  }, []);

  const resetSettings = useCallback(() => {
    void storeResetGeneralSettings().then(setCachedSettings);
  }, []);

  return {
    settings,
    updateSetting,
    setAllSettings,
    resetSettings,
  } as const;
}
