import { z } from "zod";

const keyCombo = z.object({
  key: z.string(),
  ctrlKey: z.boolean(),
  altKey: z.boolean(),
  shiftKey: z.boolean(),
  metaKey: z.boolean(),
});

const keybindMap = z.object({
  "toggle-app": keyCombo,
  search: keyCombo,
  settings: keyCombo,
});

const keybindAction = z.enum(["toggle-app", "search", "settings"]);

export const keybindsIpcSchema = {
  "keybinds/get": {
    args: z.tuple([]),
    return: keybindMap,
  },
  "keybinds/set": {
    args: z.tuple([keybindMap]),
    return: keybindMap,
  },
  "keybinds/update": {
    args: z.tuple([keybindAction, keyCombo]),
    return: keybindMap,
  },
  "keybinds/reset": {
    args: z.tuple([]),
    return: keybindMap,
  },
} as const;
