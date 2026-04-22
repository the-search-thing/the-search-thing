import type { SqliteAdapter } from './sqlite-adapter'
import { DEFAULT_KEYBINDS, type KeybindAction, type KeybindMap, type KeyCombo } from './keybind-store'

type KeybindRow = {
  action: KeybindAction
  key: string
  ctrl_key: number
  alt_key: number
  shift_key: number
  meta_key: number
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS keybinds (
  action TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  ctrl_key INTEGER NOT NULL,
  alt_key INTEGER NOT NULL,
  shift_key INTEGER NOT NULL,
  meta_key INTEGER NOT NULL
);
`

const comboFromRow = (row: KeybindRow): KeyCombo => ({
  key: row.key,
  ctrlKey: Boolean(row.ctrl_key),
  altKey: Boolean(row.alt_key),
  shiftKey: Boolean(row.shift_key),
  metaKey: Boolean(row.meta_key),
})

const runUpsert = (adapter: SqliteAdapter, action: KeybindAction, combo: KeyCombo) => {
  adapter.run(
    `INSERT INTO keybinds (action, key, ctrl_key, alt_key, shift_key, meta_key)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(action) DO UPDATE SET
       key = excluded.key,
       ctrl_key = excluded.ctrl_key,
       alt_key = excluded.alt_key,
       shift_key = excluded.shift_key,
       meta_key = excluded.meta_key`,
    [action, combo.key, combo.ctrlKey ? 1 : 0, combo.altKey ? 1 : 0, combo.shiftKey ? 1 : 0, combo.metaKey ? 1 : 0]
  )
}

export const createKeybindsStore = (adapter: SqliteAdapter) => {
  const init = () => {
    adapter.exec(schemaSql)
  }

  const getKeybinds = (): KeybindMap => {
    const rows = adapter.all<KeybindRow>(
      'SELECT action, key, ctrl_key, alt_key, shift_key, meta_key FROM keybinds'
    )
    const map: KeybindMap = { ...DEFAULT_KEYBINDS }

    for (const row of rows) {
      if (row.action in map) {
        map[row.action] = comboFromRow(row)
      }
    }

    return map
  }

  const setKeybinds = (map: KeybindMap): KeybindMap => {
    adapter.exec('DELETE FROM keybinds')
    for (const [action, combo] of Object.entries(map) as [KeybindAction, KeyCombo][]) {
      runUpsert(adapter, action, combo)
    }

    return getKeybinds()
  }

  const updateKeybind = (action: KeybindAction, combo: KeyCombo): KeybindMap => {
    runUpsert(adapter, action, combo)
    return getKeybinds()
  }

  const resetKeybinds = (): KeybindMap => {
    adapter.exec('DELETE FROM keybinds')
    return { ...DEFAULT_KEYBINDS }
  }

  return {
    init,
    getKeybinds,
    setKeybinds,
    updateKeybind,
    resetKeybinds,
    close: () => adapter.close(),
  }
}
