import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings } from "lucide-react";
import { Searchbar } from "../components/ui/searchbar";
import { Button } from "../components/ui/button";
import { useConveyor } from "@/app/hooks/use-conveyor";
import { cn } from "@/lib/utils";
import "./styles.css";
import Results from "../components/Results";
import { SearchHistoryEntry, SearchResponse } from "../types/types";
import { useAppContext } from "../AppContext";

export default function Home() {
  const [query, setQuery] = useState("");
  const search = useConveyor("search");
  const [searchResults, setSearchResults] = useState<SearchResponse>();
  const [hasSearched, setHasSearched] = useState(false); //temporary logic (pls remove in the future :pray:)
  const [isLoading, setIsLoading] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [recentSearches, setRecentSearches] = useState<SearchHistoryEntry[]>([]);
  const {
    setAwaitingIndexing,
    awaitingIndexing,
    currentJobId,
    setCurrentJobId,
    setIndexingLocation,
    indexingLocation,
    setDirIndexed,
    setJobStatus,
  } = useAppContext();
  const navigate = useNavigate();

  const refreshRecentSearches = useCallback(async () => {
    try {
      const recent = await search.getRecentSearches(10);
      setRecentSearches(recent);
    } catch (error) {
      console.error("Failed to load recent searches:", error);
    }
  }, [search]);

  useEffect(() => {
    refreshRecentSearches();
  }, [refreshRecentSearches]);

  // Poll job status while an index job is running (previously lived in Footer)
  useEffect(() => {
    if (!currentJobId) {
      setJobStatus(null);
      return;
    }

    let isActive = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const fetchStatus = async () => {
      try {
        const status = await search.indexStatus(currentJobId);
        if (!isActive) return;
        setJobStatus(status);
        if (status.status === "completed" || status.status === "failed") {
          clearInterval(intervalId);
          const delay = status.status === "completed" ? 3000 : 5000;
          timeoutId = setTimeout(() => {
            if (!isActive) return;
            setCurrentJobId(null);
            setIndexingLocation(null);
            setDirIndexed(null);
            setJobStatus(null);
            setAwaitingIndexing(false);
          }, delay);
        }
      } catch (error) {
        console.error("Error fetching index status:", error);
      }
    };

    fetchStatus();
    const intervalId = window.setInterval(fetchStatus, 2000);
    return () => {
      isActive = false;
      clearInterval(intervalId);
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    currentJobId,
    search,
    setCurrentJobId,
    setIndexingLocation,
    setDirIndexed,
    setJobStatus,
    setAwaitingIndexing,
  ]);

  const handleStartIndexing = useCallback(async () => {
    const res = await search.openFileDialog();

    if (!res || res.length === 0) return;

    setIsIndexing(true);
    try {
      const indexRes = await search.index(res);
      if (indexRes.success && indexRes.job_id) {
        setCurrentJobId(indexRes.job_id);
        setDirIndexed(res);
        setIndexingLocation("footer");
      }
    } catch (error) {
      console.error("Error indexing files:", error);
    } finally {
      setIsIndexing(false);
    }
  }, [search, setCurrentJobId, setDirIndexed, setIndexingLocation]);

  const handleSearch = async (nextQuery?: string) => {
    const effectiveQuery = (nextQuery ?? query).trim();
    if (!effectiveQuery) {
      return;
    }

    if (nextQuery !== undefined) {
      setQuery(effectiveQuery);
    }

    setIsLoading(true);
    try {
      const res = await search.search(effectiveQuery);
      setSearchResults(res);
      setHasSearched(true);
      await search.addSearchHistory({
        search_string: effectiveQuery,
        timestamp: Date.now(),
      });
      refreshRecentSearches();
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const raw = sessionStorage.getItem("home-state");
    if (!raw) return;
    try {
      const state = JSON.parse(raw) as {
        query?: string;
        hasSearched?: boolean;
        searchResults?: SearchResponse;
        awaitingIndexing?: boolean;
        currentJobId?: string | null;
      };
      if (typeof state.query === "string") setQuery(state.query);
      if (typeof state.hasSearched === "boolean") setHasSearched(state.hasSearched);
      if (state.searchResults !== undefined) setSearchResults(state.searchResults);
      if (typeof state.awaitingIndexing === "boolean") setAwaitingIndexing(state.awaitingIndexing);
      if (typeof state.currentJobId !== "undefined") setCurrentJobId(state.currentJobId ?? null);
    } catch {
      // ignore malformed storage
    }
  }, []);

  useEffect(() => {
    const state = {
      query,
      hasSearched,
      searchResults,
      awaitingIndexing,
      currentJobId,
    };
    sessionStorage.setItem("home-state", JSON.stringify(state));
  }, [query, hasSearched, searchResults, awaitingIndexing, currentJobId]);

  return (
    <div className="welcome-content flex flex-col gap-5 h-screen bg-background text-foreground">
      <div className="flex flex-row items-center flex-none min-h-[55px] bg-background pl-4 border-b border-zinc-700">
        <Searchbar
          className="bg-transparent shadow-none px-0"
          data-search-input="true"
          value={query}
          onChange={(e) => {
            const newQuery = e.target.value;
            setQuery(newQuery);
            setHasSearched(false);
            setAwaitingIndexing(false);

            if (currentJobId && indexingLocation === "results" && newQuery.length > 0) {
              setIndexingLocation("footer");
            }
          }}
          placeholder="Search for anything..."
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSearch();
            }
          }}
        />
        <Button
          variant="transparent"
          size="sm"
          onClick={handleStartIndexing}
          disabled={isIndexing || !!currentJobId}
          data-index-button="true"
          className="flex-none"
        >
          Index 
        </Button>
        <button
          onClick={() => navigate("/settings")}
          className="flex items-center justify-center h-8 w-8 rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-150 flex-none mx-2"
          aria-label="Open settings"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      <div className={cn("flex flex-1 min-h-0", "bg-background", "px-4 pt-4")}>
        {isLoading ? (
          <div className="flex items-center justify-center w-full text-foreground">Searching...</div>
        ) : (
          <Results
            searchResults={searchResults}
            query={query}
            hasSearched={hasSearched}
            recentSearches={recentSearches}
            onRecentSearchSelect={(searchQuery) => handleSearch(searchQuery)}
            onIndexingCancelled={() => setAwaitingIndexing(false)}
          />
        )}
      </div>
    </div>
  );
}
