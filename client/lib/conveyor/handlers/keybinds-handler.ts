import { app } from "electron";
import { join } from "path";
import { handle } from "@/lib/main/shared";
import { createBetterSqliteAdapter } from "@/lib/storage/sqlite-adapter";
import { createKeybindsStore } from "@/lib/storage/keybinds-db-store";
import type { KeybindMap } from "@/lib/storage/keybind-store";

let store: ReturnType<typeof createKeybindsStore> | null = null;

const getStore = () => {
  if (store) {
    return store;
  }

  const dbPath = join(app.getPath("userData"), "keybinds.db");
  const adapter = createBetterSqliteAdapter(dbPath);
  store = createKeybindsStore(adapter);
  store.init();

  return store;
};

export const registerKeybindsHandlers = (onChange?: (map: KeybindMap) => void) => {
  app.on("before-quit", () => {
    store?.close?.();
  });

  handle("keybinds/get", async () => {
    return getStore().getKeybinds();
  });

  handle("keybinds/set", async (map) => {
    const next = getStore().setKeybinds(map);
    onChange?.(next);
    return next;
  });

  handle("keybinds/update", async (action, combo) => {
    const next = getStore().updateKeybind(action, combo);
    onChange?.(next);
    return next;
  });

  handle("keybinds/reset", async () => {
    const next = getStore().resetKeybinds();
    onChange?.(next);
    return next;
  });
};
