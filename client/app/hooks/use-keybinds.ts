import { useCallback, useEffect, useState } from 'react'

import { type KeybindMap, type KeybindAction, type KeyCombo, KEYBIND_CHANGE_EVENT, DEFAULT_KEYBINDS } from '@/lib/storage/keybind-store'
import {
  loadKeybinds,
  saveKeybinds,
  updateKeybind as storeUpdateKeybind,
  resetKeybinds as storeResetKeybinds,
} from '@/lib/storage/keybinds-client'

export function useKeybinds() {
  const [keybinds, setKeybinds] = useState<KeybindMap>({ ...DEFAULT_KEYBINDS })

  // Re-read from DB whenever any part of the app writes new bindings.
  useEffect(() => {
    let isActive = true
    const sync = () => {
      void loadKeybinds().then((next) => {
        if (isActive) {
          setKeybinds(next)
        }
      })
    }

    sync()

    window.addEventListener(KEYBIND_CHANGE_EVENT, sync)

    return () => {
      isActive = false
      window.removeEventListener(KEYBIND_CHANGE_EVENT, sync)
    }
  }, [])

  const updateKeybind = useCallback((action: KeybindAction, combo: KeyCombo) => {
    setKeybinds((prev) => ({ ...prev, [action]: combo }))
    void storeUpdateKeybind(action, combo)
  }, [])

  const setAllKeybinds = useCallback((map: KeybindMap) => {
    setKeybinds(map)
    void saveKeybinds(map)
  }, [])

  const resetKeybinds = useCallback(() => {
    void storeResetKeybinds().then((map) => setKeybinds(map))
  }, [])

  return {
    keybinds,
    updateKeybind,
    setAllKeybinds,
    resetKeybinds,
  } as const
}
