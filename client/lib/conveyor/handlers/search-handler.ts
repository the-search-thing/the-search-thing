import { handle } from "@/lib/main/shared";
import { app, dialog, shell } from "electron";
import axios from "axios";
import * as fs from "fs";
import { sidecarClient } from "@/lib/main/sidecar-client";

export const registerSearchHandlers = () => {
  const useSidecarForIndexing = process.env["USE_RUST_SIDECAR_INDEXING"] !== "false";
  const useSidecarForSearch = process.env["USE_RUST_SIDECAR_SEARCH"] !== "false";

  handle("search", async (query: string) => {
    if (useSidecarForSearch) {
      return sidecarClient.searchQuery(query);
    }

    const response = await axios.get("http://localhost:8000/api/search", {
      params: { q: query },
    });
    return response.data;
  });

  handle("sidecar-ping", async () => {
    return sidecarClient.ping();
  });

  handle("sidecar-walk-text-batch", async (input) => {
    return sidecarClient.walkTextBatch(input);
  });

  handle("index", async (dirPaths: string) => {
    if (useSidecarForIndexing) {
      return sidecarClient.indexStart(dirPaths);
    }

    const response = await axios.get("http://localhost:8000/api/index", {
      params: { dir: dirPaths },
    });
    return { success: response.data.success, job_id: response.data.job_id };
  });

  handle("index-status", async (jobId: string) => {
    if (useSidecarForIndexing) {
      return sidecarClient.indexStatus(jobId);
    }

    const response = await axios.get("http://localhost:8000/api/index/status", {
      params: { job_id: jobId },
    });
    return response.data;
  });

  handle("clear-index", async () => {
    if (!useSidecarForIndexing) {
      throw new Error(
        "Clear index requires the Rust sidecar (USE_RUST_SIDECAR_INDEXING must not be false).",
      );
    }
    return sidecarClient.clearIndex();
  });

  // System operations
  handle("open-file-dialog", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return result.filePaths[0] ?? "";
  });

  handle("open-file", async (filePath: string) => {
    await shell.openPath(filePath);
    return null;
  });

  handle("get-file-icon", async (filePath: string) => {
    const icon = await app.getFileIcon(filePath, { size: "normal" });
    return icon.toDataURL();
  });

  handle("read-file-content", async (filePath: string) => {
    const content = await fs.promises.readFile(filePath, { encoding: "utf-8" });
    return content.length > 8000 ? content.slice(0, 8000) + "\n…" : content;
  });
};
