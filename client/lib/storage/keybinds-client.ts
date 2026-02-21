import {
  DEFAULT_KEYBINDS,
  KEYBIND_CHANGE_EVENT,
  type KeybindAction,
  type KeybindMap,
  type KeyCombo,
} from './keybind-store'

const getKeybindsApi = () => window.conveyor.keybinds

export const loadKeybinds = async (): Promise<KeybindMap> => {
  try {
    return await getKeybindsApi().getKeybinds()
  } catch (error) {
    console.error('Failed to load keybinds from DB:', error)
    return { ...DEFAULT_KEYBINDS }
  }
}

export const saveKeybinds = async (map: KeybindMap): Promise<KeybindMap> => {
  const result = await getKeybindsApi().setKeybinds(map)
  window.dispatchEvent(new CustomEvent(KEYBIND_CHANGE_EVENT))
  return result
}

export const updateKeybind = async (action: KeybindAction, combo: KeyCombo): Promise<KeybindMap> => {
  const result = await getKeybindsApi().updateKeybind(action, combo)
  window.dispatchEvent(new CustomEvent(KEYBIND_CHANGE_EVENT))
  return result
}

export const resetKeybinds = async (): Promise<KeybindMap> => {
  const result = await getKeybindsApi().resetKeybinds()
  window.dispatchEvent(new CustomEvent(KEYBIND_CHANGE_EVENT))
  return result
}
