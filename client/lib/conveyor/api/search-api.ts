import { ConveyorApi } from "@/lib/preload/shared";
import type { SearchHistoryInsert } from "@/lib/storage/search-history-store";

export class SearchApi extends ConveyorApi {
  index = (dirPaths: string) => this.invoke("index", dirPaths);
  indexStatus = (jobId: string) => this.invoke("index-status", jobId);
  search = (input: string) => this.invoke("search", input);

  sidecarPing = () => this.invoke("sidecar-ping");
  sidecarWalkTextBatch = (input: {
    dir: string;
    textExts: string[];
    ignoreExts: string[];
    ignoreFiles: string[];
    cursor: number;
    batchSize: number;
  }) => this.invoke("sidecar-walk-text-batch", input);

  // system methods
  openFileDialog = () => this.invoke("open-file-dialog");
  openFile = (filePath: string) => this.invoke("open-file", filePath);
  getFileIcon = (filePath: string): Promise<string> => this.invoke("get-file-icon", filePath);
  readFileContent = (filePath: string): Promise<string> => this.invoke("read-file-content", filePath);

  addSearchHistory = (input: SearchHistoryInsert) => this.invoke("search-history/add", input);
  getRecentSearches = (limit = 20) => this.invoke("search-history/recent", limit);
  pruneSearchHistory = (maxItems: number) => this.invoke("search-history/prune", maxItems);
  clearIndex = () => this.invoke("clear-index");
}
