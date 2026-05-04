import { handle } from "@/lib/main/shared";
import { dialog, shell } from "electron";
import axios from "axios";
import { readFile } from "fs/promises";
import { sidecarClient } from "@/lib/main/sidecar-client";

const MAX_RESULT_CONTENT_CHARS = 500_000;

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

  handle("search-result-content", async (filePath: string) => {
    try {
      const content = await readFile(filePath, "utf8");
      const truncated =
        content.length > MAX_RESULT_CONTENT_CHARS
          ? `${content.slice(0, MAX_RESULT_CONTENT_CHARS)}\n\n[truncated for preview]`
          : content;
      return { content: truncated };
    } catch {
      return { content: null };
    }
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
};
