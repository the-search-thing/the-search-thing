import { ConveyorApi } from '@/lib/preload/shared'
import type { KeybindAction, KeybindMap, KeyCombo } from '@/lib/storage/keybind-store'

export class KeybindsApi extends ConveyorApi {
  getKeybinds = () => this.invoke('keybinds/get')
  setKeybinds = (map: KeybindMap) => this.invoke('keybinds/set', map)
  updateKeybind = (action: KeybindAction, combo: KeyCombo) => this.invoke('keybinds/update', action, combo)
  resetKeybinds = () => this.invoke('keybinds/reset')
}
