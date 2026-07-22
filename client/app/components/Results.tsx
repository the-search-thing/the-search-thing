import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { FileX } from "lucide-react";
import { ResultProps, SearchResultItem } from "../types/types";
import { useConveyor } from "../hooks/use-conveyor";
import { useAppContext } from "../AppContext";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./ui/resizable";
import ResultsSidebar from "./results/ResultsSidebar";
import ResultsPreview from "./results/ResultsPreview";

type ResultItem = SearchResultItem;

interface ResultsWithContextProps extends ResultProps {
  onIndexingCancelled?: () => void;
}

const SIDEBAR_LAYOUT_KEY = "results-sidebar-layout";

const Results: React.FC<ResultsWithContextProps> = ({
  searchResults,
  query,
  hasSearched,
  onIndexingCancelled,
  recentSearches = [],
  onRecentSearchSelect,
}) => {
  const [selectedItem, setSelectedItem] = useState<ResultItem | null>(null);
  const [brokenImagePaths, setBrokenImagePaths] = useState<Set<string>>(new Set());
  const [hasInitiatedIndexing, setHasInitiatedIndexing] = useState(false);
  const hasOpenedDialogRef = useRef(false);
  const search = useConveyor("search");

  const {
    awaitingIndexing,
    currentJobId,
    setCurrentJobId,
    indexingLocation,
    setIndexingLocation,
    dirIndexed,
    setDirIndexed,
    setAwaitingIndexing,
    jobStatus,
  } = useAppContext();

  const allResults = searchResults?.results || [];

  const [defaultLayout] = useState<Record<string, number> | undefined>(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_LAYOUT_KEY);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as Record<string, number>;
      if (typeof parsed.sidebar === "number" && typeof parsed.preview === "number") {
        return parsed;
      }
    } catch {
      // ignore malformed storage
    }
    return undefined;
  });

  useEffect(() => {
    setSelectedItem(null);
    setBrokenImagePaths(new Set());
  }, [searchResults]);

  useEffect(() => {
    if (!hasSearched) {
      setHasInitiatedIndexing(false);
      hasOpenedDialogRef.current = false;
    }
  }, [hasSearched, query]);

  const handleOpen = (filePath: string) => {
    search.openFile(filePath);
  };

  const markImageAsBroken = (path: string) => {
    setBrokenImagePaths((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  };

  const handleStartIndexing = useCallback(async () => {
    const res = await search.openFileDialog();
    if (!res || res.length === 0) {
      // User cancelled the file dialog - reset the awaiting state
      onIndexingCancelled?.();
      setAwaitingIndexing(false);
      setHasInitiatedIndexing(false);
      hasOpenedDialogRef.current = false;
      return;
    }

    setDirIndexed(res);
    try {
      const indexRes = await search.index(res);
      console.error("Index response:", indexRes);
      if (indexRes.success && indexRes.job_id) {
        setCurrentJobId(indexRes.job_id);
        setIndexingLocation("results");
      }
    } catch (error) {
      console.error("Error indexing files:", error);
    }
  }, [
    search,
    onIndexingCancelled,
    setCurrentJobId,
    setIndexingLocation,
    setDirIndexed,
    setAwaitingIndexing,
  ]);

  useEffect(() => {
    if (awaitingIndexing && !currentJobId && !hasInitiatedIndexing && !hasOpenedDialogRef.current) {
      //temporary guardrail for development strict mode
      hasOpenedDialogRef.current = true;
      setHasInitiatedIndexing(true);
      handleStartIndexing();
    }
  }, [awaitingIndexing, currentJobId, hasInitiatedIndexing, handleStartIndexing]);

  // Searched but found nothing (keep split layout available while indexing)
  const isIndexingActive = !!currentJobId || (indexingLocation === "results" && awaitingIndexing);

  if (hasSearched && allResults.length === 0 && query && !isIndexingActive) {
    return (
      <div className="flex h-full w-full flex-col items-center gap-4 pt-30">
        <FileX className="size-15 opacity-55" />
        <div className="flex flex-col items-center">
          <div className="text-muted-foreground">No results for "{query}"</div>
          <div className="text-muted-foreground">Press Enter to index directories.</div>
        </div>
      </div>
    );
  }

  const showRecentSearches = !hasSearched;

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full w-full"
      defaultLayout={defaultLayout}
      onLayoutChanged={(layout) => {
        localStorage.setItem(SIDEBAR_LAYOUT_KEY, JSON.stringify(layout));
      }}
    >
      <ResizablePanel
        id="sidebar"
        defaultSize={280}
        minSize={200}
        maxSize={480}
        className="min-h-0"
      >
        <ResultsSidebar
          showRecentSearches={showRecentSearches}
          recentSearches={recentSearches}
          results={allResults}
          selectedItem={selectedItem}
          onSelectResult={setSelectedItem}
          onOpenResult={handleOpen}
          onRecentSearchSelect={onRecentSearchSelect}
        />
      </ResizablePanel>
      <ResizableHandle withHandle className="bg-border" />
      <ResizablePanel id="preview" minSize={300} className="min-h-0 min-w-0">
        <ResultsPreview
          isIndexingActive={isIndexingActive}
          jobStatus={jobStatus}
          currentJobId={currentJobId}
          dirIndexed={dirIndexed}
          selectedItem={selectedItem}
          hasResults={allResults.length > 0}
          brokenImagePaths={brokenImagePaths}
          onImageError={markImageAsBroken}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

export default Results;
