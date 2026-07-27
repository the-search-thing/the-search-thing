export type KeyCombo = {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

// current keybind actions
export type KeybindAction = "search" | "settings" | "toggle-app";
export type KeybindMap = Record<KeybindAction, KeyCombo>;
export type KeybindMeta = {
  action: KeybindAction;
  label: string;
  description: string;
};

// all keybind actions right now
export const KEYBIND_ACTIONS: KeybindMeta[] = [
  { action: "toggle-app", label: "Show app", description: "Show or hide the app window." },
  { action: "search", label: "Search", description: "Focus the search bar and run a search." },
  { action: "settings", label: "Open settings", description: "Navigate to the settings page." },
];

//default keybinds
export const DEFAULT_KEYBINDS: KeybindMap = {
  "toggle-app": { key: "space", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false },
  search: { key: "f", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false },
  settings: { key: "b", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false },
};

export const KEYBIND_CHANGE_EVENT = "keybind-store:change";

// helpers
export const comboModifierTokens = (combo: KeyCombo, metaLabel = "Meta"): string[] => {
  const parts: string[] = [];
  if (combo.ctrlKey) parts.push("Ctrl");
  if (combo.altKey) parts.push("Alt");
  if (combo.shiftKey) parts.push("Shift");
  if (combo.metaKey) parts.push(metaLabel);
  return parts;
};

export const formatCombo = (combo: KeyCombo): string => {
  const parts = comboModifierTokens(combo);
  parts.push(formatKey(combo.key));
  return parts.join(" + ");
};

export const comboTokens = (combo: KeyCombo): string[] => {
  const parts = comboModifierTokens(combo);
  parts.push(formatKey(combo.key));
  return parts;
};

export const matchesCombo = (event: KeyboardEvent, combo: KeyCombo): boolean => {
  return (
    event.key.toLowerCase() === combo.key.toLowerCase() &&
    event.ctrlKey === combo.ctrlKey &&
    event.altKey === combo.altKey &&
    event.shiftKey === combo.shiftKey &&
    event.metaKey === combo.metaKey
  );
};

export const comboFromEvent = (event: KeyboardEvent): KeyCombo | null => {
  const key = normalizeKey(event.key);

  // Ignore bare modifier presses – the user hasn't finished the combo yet
  if (["control", "alt", "shift", "meta"].includes(key)) {
    return null;
  }

  return {
    key,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
  };
};

export const combosEqual = (a: KeyCombo, b: KeyCombo): boolean => {
  return (
    a.key === b.key &&
    a.ctrlKey === b.ctrlKey &&
    a.altKey === b.altKey &&
    a.shiftKey === b.shiftKey &&
    a.metaKey === b.metaKey
  );
};

export const findConflict = (
  combo: KeyCombo,
  current: KeybindMap,
  ignoreAction: KeybindAction,
): KeybindAction | null => {
  for (const [action, existing] of Object.entries(current) as [KeybindAction, KeyCombo][]) {
    if (action === ignoreAction) continue;
    if (combosEqual(combo, existing)) return action;
  }
  return null;
};

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function normalizeKey(key: string): string {
  if (key === " ") return "space";
  return key.toLowerCase();
}

function formatKey(key: string): string {
  if (key === " ") return "Space";
  const normalized = key.toLowerCase();
  if (normalized === "space") return "Space";
  return normalized.length === 1 ? normalized.toUpperCase() : capitalize(normalized);
}
