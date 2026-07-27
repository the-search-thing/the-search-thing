import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen, Settings } from "lucide-react";
import { Searchbar } from "../components/ui/searchbar";
import { Button } from "../components/ui/button";
import { useConveyor } from "@/app/hooks/use-conveyor";
import { cn } from "@/lib/utils";
import "./styles.css";
import Results from "../components/Results";
import type { SearchHistoryEntry, SearchResponse, SearchResultItem } from "../types/types";

const SEARCH_ROOT_KEY = "search-root";
const SEARCH_LIMIT = 50;
type SearchMode = "files" | "grep";
type SearchApi = Window["conveyor"]["search"];
const SEARCH_MODES: ReadonlyArray<SearchMode> = ["files", "grep"];

const fileNameFromPath = (path: string): string => {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
};

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const useRecentSearches = (search: SearchApi) => {
  const [items, setItems] = useState<SearchHistoryEntry[]>([]);
  const refresh = useCallback(async () => {
    try {
      setItems(await search.getRecentSearches(10));
    } catch (cause) {
      console.error("Failed to load recent searches:", cause);
    }
  }, [search]);
  useEffect(() => void refresh(), [refresh]);
  return { items, refresh };
};

const useSearchRoot = (search: SearchApi) => {
  const [root, setRoot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedRoot = localStorage.getItem(SEARCH_ROOT_KEY);
    if (!savedRoot) return;
    let active = true;
    setLoading(true);
    search
      .setRoot(savedRoot)
      .then((nextRoot) => active && setRoot(nextRoot))
      .catch((cause) => active && setError(formatError(cause)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [search]);

  const choose = async () => {
    const selectedRoot = await search.openFileDialog();
    if (!selectedRoot) return false;
    setLoading(true);
    setError(null);
    try {
      const nextRoot = await search.setRoot(selectedRoot);
      localStorage.setItem(SEARCH_ROOT_KEY, nextRoot);
      setRoot(nextRoot);
      return true;
    } catch (cause) {
      setError(formatError(cause));
      return false;
    } finally {
      setLoading(false);
    }
  };
  return { root, loading, error, choose };
};

const mapFileResults = (
  items: ReadonlyArray<{ fileName: string; relativePath: string }>,
): SearchResultItem[] => items.map((item) => ({ kind: "file", ...item }));

const mapContentResults = (
  items: ReadonlyArray<{ relativePath: string; lineNumber: number; lineContent: string }>,
): SearchResultItem[] =>
  items.map((item) => ({
    kind: "content",
    ...item,
    fileName: fileNameFromPath(item.relativePath),
  }));

const searchWithMode = async (search: SearchApi, mode: SearchMode, query: string) => {
  if (mode === "files") {
    const response = await search.fileSearch(query, SEARCH_LIMIT);
    return {
      items: mapFileResults(response.items),
      totalMatched: response.totalMatched,
    };
  }
  const response = await search.contentSearch(query, "fuzzy", SEARCH_LIMIT);
  return {
    items: mapContentResults(response.items),
    totalMatched: response.totalMatched,
  };
};

const useSearchResults = (
  search: SearchApi,
  root: string | null,
  refreshRecentSearches: () => Promise<void>,
) => {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("files");
  const [results, setResults] = useState<SearchResponse>();
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (nextQuery?: string) => {
    const effectiveQuery = (nextQuery ?? query).trim();
    if (!effectiveQuery) return;
    if (!root) {
      setError("Choose a folder before searching.");
      return;
    }
    if (nextQuery !== undefined) setQuery(effectiveQuery);
    setLoading(true);
    setError(null);
    try {
      const response = await searchWithMode(search, mode, effectiveQuery);
      setResults({ query: effectiveQuery, mode, ...response });
      setSearched(true);
      await search.addSearchHistory({ search_string: effectiveQuery, timestamp: Date.now() });
      void refreshRecentSearches();
    } catch (cause) {
      setError(formatError(cause));
    } finally {
      setLoading(false);
    }
  };

  const changeMode = (nextMode: SearchMode) => {
    setMode(nextMode);
    setResults(undefined);
    setSearched(false);
    setError(null);
  };
  return {
    query,
    setQuery,
    mode,
    changeMode,
    results,
    setResults,
    searched,
    setSearched,
    run,
    loading,
    error,
    clearError: () => setError(null),
  };
};

type SearchHeaderProps = {
  query: string;
  mode: SearchMode;
  root: string | null;
  rootLoading: boolean;
  onQueryChange: (query: string) => void;
  onModeChange: (mode: SearchMode) => void;
  onSearch: () => void;
  onChooseRoot: () => void;
  onSettings: () => void;
};

const SearchHeader = (props: SearchHeaderProps) => (
  <div className="flex min-h-13.5 flex-none flex-row items-center border-b border-zinc-700 bg-background pl-4">
    <Searchbar
      className="bg-transparent px-0 shadow-none"
      data-search-input="true"
      value={props.query}
      onChange={(event) => props.onQueryChange(event.target.value)}
      placeholder={
        props.root
          ? props.mode === "files"
            ? "Search file names..."
            : "Search file contents..."
          : "Choose a folder to search"
      }
      disabled={props.rootLoading}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          props.onSearch();
        }
      }}
    />
    <div className="mx-2 flex flex-none rounded-md bg-muted p-0.5">
      {SEARCH_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => props.onModeChange(mode)}
          className={cn(
            "rounded px-2 py-1 text-xs capitalize",
            props.mode === mode ? "bg-accent text-accent-foreground" : "text-muted-foreground",
          )}
        >
          {mode}
        </button>
      ))}
    </div>
    <Button
      variant="transparent"
      size="sm"
      onClick={props.onChooseRoot}
      disabled={props.rootLoading}
      className="flex-none gap-1"
      title={props.root ?? "Choose search folder"}
    >
      <FolderOpen className="size-4" />
      {props.rootLoading ? "Scanning" : props.root ? fileNameFromPath(props.root) : "Folder"}
    </Button>
    <button
      onClick={props.onSettings}
      className="mx-2 flex h-8 w-8 flex-none items-center justify-center rounded-md text-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
      aria-label="Open settings"
    >
      <Settings className="h-5 w-5" />
    </button>
  </div>
);

export default function Home() {
  const search = useConveyor("search");
  const navigate = useNavigate();
  const recent = useRecentSearches(search);
  const searchRoot = useSearchRoot(search);
  const searchState = useSearchResults(search, searchRoot.root, recent.refresh);
  const error = searchRoot.error ?? searchState.error;

  const chooseRoot = async () => {
    const changed = await searchRoot.choose();
    if (!changed) return;
    searchState.setResults(undefined);
    searchState.setSearched(false);
  };
  return (
    <div className="welcome-content flex h-screen flex-col gap-5 bg-background text-foreground">
      <SearchHeader
        query={searchState.query}
        mode={searchState.mode}
        root={searchRoot.root}
        rootLoading={searchRoot.loading}
        onQueryChange={(query) => {
          searchState.setQuery(query);
          searchState.setSearched(false);
          searchState.clearError();
        }}
        onModeChange={searchState.changeMode}
        onSearch={() => void searchState.run()}
        onChooseRoot={() => void chooseRoot()}
        onSettings={() => navigate("/settings")}
      />
      {error && <div className="px-4 text-sm text-destructive">{error}</div>}
      <div className="flex min-h-0 flex-1 bg-background px-4 pt-4">
        {searchState.loading ? (
          <div className="flex w-full items-center justify-center text-foreground">
            Searching...
          </div>
        ) : (
          <Results
            searchResults={searchState.results}
            query={searchState.query}
            hasSearched={searchState.searched}
            recentSearches={recent.items}
            onRecentSearchSelect={(query) => void searchState.run(query)}
          />
        )}
      </div>
    </div>
  );
}
