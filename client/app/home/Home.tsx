import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings } from "lucide-react";
import { Searchbar } from "../components/ui/searchbar";
import { useConveyor } from "@/app/hooks/use-conveyor";
import { cn } from "@/lib/utils";
import "./styles.css";
import Results from "../components/Results";
import Footer from "../components/Footer";
import { SearchHistoryEntry, SearchResponse } from "../types/types";
import { useAppContext } from "../AppContext";

export default function Home() {
  const [query, setQuery] = useState("");
  const search = useConveyor("search");
  const [searchResults, setSearchResults] = useState<SearchResponse>();
  const [hasSearched, setHasSearched] = useState(false); //temporary logic (pls remove in the future :pray:)
  const [isLoading, setIsLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<SearchHistoryEntry[]>([]);
  const {
    setAwaitingIndexing,
    awaitingIndexing,
    currentJobId,
    setCurrentJobId,
    setIndexingLocation,
    indexingLocation,
  } = useAppContext();
  const [hasInteracted, setHasInteracted] = useState(false);
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

  const handleSearch = async (nextQuery?: string) => {
    const effectiveQuery = (nextQuery ?? query).trim();
    if (!effectiveQuery) {
      return;
    }

    if (nextQuery !== undefined) {
      setQuery(effectiveQuery);
    }

    setHasInteracted(true);
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
        hasInteracted?: boolean;
        hasSearched?: boolean;
        searchResults?: SearchResponse;
        awaitingIndexing?: boolean;
        currentJobId?: string | null;
      };
      if (typeof state.query === "string") setQuery(state.query);
      if (typeof state.hasInteracted === "boolean") setHasInteracted(state.hasInteracted);
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
      hasInteracted,
      hasSearched,
      searchResults,
      awaitingIndexing,
      currentJobId,
    };
    sessionStorage.setItem("home-state", JSON.stringify(state));
  }, [query, hasInteracted, hasSearched, searchResults, awaitingIndexing, currentJobId]);

  return (
    <div className="welcome-content flex flex-col gap-5 h-screen bg-background text-foreground">
      <div className="flex flex-row items-center flex-none min-h-[55px] bg-background pl-4">
        <Searchbar
          className="bg-transparent shadow-none px-0"
          data-search-input="true"
          value={query}
          onChange={(e) => {
            const newQuery = e.target.value;
            setQuery(newQuery);
            setHasSearched(false);
            setAwaitingIndexing(false);
            setHasInteracted(true);

            if (currentJobId && indexingLocation === "results" && newQuery.length > 0) {
              setIndexingLocation("footer");
            }
          }}
          placeholder="Search for files or folders…"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSearch();
            }
          }}
        />
        <button
          onClick={() => navigate("/settings")}
          className="flex items-center justify-center h-8 w-8 rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-150 flex-none mx-2"
          aria-label="Open settings"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      {hasInteracted ? (
        <div className={cn("flex flex-1 min-h-0", "bg-background", "px-4")}>
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
      ) : (
        <div
          className={cn(
            "flex flex-1 min-h-0 gap-1 flex-col items-center justify-center",
            "bg-background",
            "px-4",
          )}
        >
          <div className="text-lg text-foreground">Welcome to the-search-thing!</div>
          <div className="text-sm text-foreground">Please start searching to get started...</div>
        </div>
      )}

      <div className="flex items-center flex-none min-h-[56px] bg-background px-4">
        <Footer />
      </div>
    </div>
  );
}
