import { z } from 'zod'

const keyCombo = z.object({
  key: z.string(),
  ctrlKey: z.boolean(),
  altKey: z.boolean(),
  shiftKey: z.boolean(),
  metaKey: z.boolean(),
})

const keybindMap = z.object({
  search: keyCombo,
  index: keyCombo,
  settings: keyCombo,
})

const keybindAction = z.enum(['search', 'index', 'settings'])

export const keybindsIpcSchema = {
  'keybinds/get': {
    args: z.tuple([]),
    return: keybindMap,
  },
  'keybinds/set': {
    args: z.tuple([keybindMap]),
    return: keybindMap,
  },
  'keybinds/update': {
    args: z.tuple([keybindAction, keyCombo]),
    return: keybindMap,
  },
  'keybinds/reset': {
    args: z.tuple([]),
    return: keybindMap,
  },
} as const
