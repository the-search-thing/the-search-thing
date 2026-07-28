import { handle } from "@/lib/main/shared";
import { dialog, shell } from "electron";
import type { SearchRuntime } from "@/lib/main/search-runtime";

export const registerSearchHandlers = (searchRuntime: SearchRuntime) => {
  handle("search-root/get", () => searchRuntime.getRoot());
  handle("search-root/set", (root) => searchRuntime.setRoot(root));

  handle("file-search", async (query, limit) => {
    const result = await searchRuntime.searchFiles(query, limit);
    return {
      query,
      items: [...result.items],
      totalMatched: result.totalMatched,
    };
  });

  handle("content-search", async (query, mode, limit) => {
    const result = await searchRuntime.searchContent(query, mode, limit);
    return {
      query,
      mode,
      items: [...result.items],
      totalMatched: result.totalMatched,
    };
  });

  handle("open-file-dialog", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return result.filePaths[0] ?? "";
  });

  handle("open-file", async (relativePath) => {
    const absolutePath = await searchRuntime.resolveResultPath(relativePath);
    shell.showItemInFolder(absolutePath);
    return null;
  });

  handle("preview-file", (relativePath) => searchRuntime.previewFile(relativePath));
};
