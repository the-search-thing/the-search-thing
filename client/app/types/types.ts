export interface SearchResultItem {
  kind: "file" | "content";
  relativePath: string;
  fileName: string;
  lineNumber?: number;
  lineContent?: string;
}

export interface SearchResponse {
  query: string;
  mode: "files" | "grep";
  items: SearchResultItem[];
  totalMatched: number;
}

export type SearchHistoryEntry = {
  id: number;
  search_string: string;
  timestamp: number;
  file_types: string[] | null;
  filters: Record<string, unknown> | null;
  path_scope: string | null;
};

export interface ResultProps {
  searchResults?: SearchResponse;
  query: string;
  hasSearched: boolean;
  recentSearches?: SearchHistoryEntry[];
  onRecentSearchSelect?: (query: string) => void;
}
