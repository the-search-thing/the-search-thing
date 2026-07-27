import { ConveyorApi } from "@/lib/preload/shared";
import type { SearchHistoryInsert } from "@/lib/storage/search-history-store";

export class SearchApi extends ConveyorApi {
  getRoot = () => this.invoke("search-root/get");
  setRoot = (root: string) => this.invoke("search-root/set", root);
  fileSearch = (query: string, limit = 50) => this.invoke("file-search", query, limit);
  contentSearch = (query: string, mode: "plain" | "fuzzy" | "regex" = "fuzzy", limit = 50) =>
    this.invoke("content-search", query, mode, limit);

  openFileDialog = () => this.invoke("open-file-dialog");
  openFile = (relativePath: string) => this.invoke("open-file", relativePath);

  addSearchHistory = (input: SearchHistoryInsert) => this.invoke("search-history/add", input);
  getRecentSearches = (limit = 20) => this.invoke("search-history/recent", limit);
  pruneSearchHistory = (maxItems: number) => this.invoke("search-history/prune", maxItems);
}
