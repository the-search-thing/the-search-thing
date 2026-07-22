import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { FileX } from "lucide-react";
import { ResultProps, SearchResultItem } from "../types/types";
import * as fileIcons from "@/resources/filetype icons";
import { useConveyor } from "../hooks/use-conveyor";
import { useAppContext } from "../AppContext";
import WhimsyLoader from "./WhimsyLoader";

type ResultItem = SearchResultItem;

const phaseLabels: Record<string, string> = {
  scan_text: "Scanning text files",
  index_text: "Indexing text files",
  scan_video: "Scanning videos",
  index_video: "Indexing videos",
  scan_image: "Scanning images",
  index_image: "Indexing images",
  done: "Done",
};

interface ResultsWithContextProps extends ResultProps {
  onIndexingCancelled?: () => void;
}

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

  // Extract filename from path
  const getFileName = (path: string) => {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
  };

  const getFileExt = (path: string) => {
    const parts = path.split(".");
    return parts.length > 1 ? parts[parts.length - 1] : "";
  };

  const toImageSrc = (path: string) => {
    if (!path) return "";
    if (/^(https?:|data:|blob:|res:|localimg:)/i.test(path)) return path;

    // Use a custom protocol so renderer pages served via http://localhost
    // can still load local filesystem images safely.
    return `localimg://preview?path=${encodeURIComponent(path)}`;
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
  const isIndexingActive =
    !!currentJobId || (indexingLocation === "results" && awaitingIndexing);

  if (hasSearched && allResults.length === 0 && query && !isIndexingActive) {
    return (
      <div className="flex flex-col items-center gap-4 w-full h-full pt-30">
        <FileX className="w-15 h-15 opacity-55" />
        <div className="flex flex-col items-center">
          <div className="text-zinc-500">No results for "{query}"</div>
          <div className="text-zinc-500">Press Enter to index directories.</div>
        </div>
      </div>
    );
  }

  const jobDone = jobStatus?.status === "completed" || jobStatus?.status === "failed";

  const indexingProgress = (
    <div className="flex flex-col w-full h-full items-center justify-center p-6 gap-4">
      {!jobDone && <WhimsyLoader size={48} />}

      <div className="text-zinc-200 text-lg font-medium">
        {jobStatus?.status === "completed"
          ? "Indexing complete!"
          : jobStatus?.status === "failed"
            ? "Indexing failed"
            : jobStatus
              ? phaseLabels[jobStatus.phase] || jobStatus.phase
              : "Starting indexing..."}
      </div>

      {currentJobId && dirIndexed && (
        <div className="text-zinc-500 text-xs font-mono">Directory: {dirIndexed}</div>
      )}

      {jobStatus?.message && (
        <div className="text-zinc-400 text-xs text-center">{jobStatus.message}</div>
      )}

      {jobStatus?.error && (
        <div className="text-red-500 text-xs text-center bg-red-950/30 rounded px-3 py-2">
          {jobStatus.error}
        </div>
      )}
    </div>
  );

  const showRecentSearches = !hasSearched;

  return (
    <div className="flex items-center w-full h-full">
      <div className="flex w-full h-full">
        {/* Files & its paths */}
        <div className="w-1/3 min-w-[200px] max-w-[300px] h-full border-r border-zinc-700 flex flex-col">
          <div className="p-1 flex-none">
            <h3 className="text-zinc-400 text-[0.8rem] font-medium">
              {showRecentSearches ? "Recent Searches" : "Results"}
            </h3>
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-y-auto pr-2">
            {showRecentSearches ? (
              recentSearches.length > 0 ? (
                recentSearches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onRecentSearchSelect?.(item.search_string)}
                    className="flex items-center gap-2 p-2 rounded-xl cursor-pointer hover:bg-zinc-800 transition-colors border-b border-zinc-800 text-left"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4 text-zinc-400"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m21 21-4.3-4.3" />
                      <circle cx="11" cy="11" r="7" />
                    </svg>
                    <span className="text-zinc-100 truncate" title={item.search_string}>
                      {item.search_string}
                    </span>
                  </button>
                ))
              ) : (
                <div className="text-zinc-500 text-sm p-2">No recent searches yet.</div>
              )
            ) : (
              allResults.map((result, index) => (
                <div
                  key={`${result.path}-${result.label}-${index}`}
                  tabIndex={0}
                  onClick={() => setSelectedItem(result)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleOpen(result.path);
                    }
                  }}
                  onMouseDown={(e) => {
                    if (e.metaKey || e.ctrlKey) {
                      handleOpen(result.path);
                    }
                  }}
                  className={`flex flex-row p-2 rounded-xl cursor-pointer hover:bg-zinc-800 transition-colors border-b border-zinc-800 ${
                    selectedItem?.path === result.path ? "bg-zinc-700" : ""
                  }`}
                >
                  <div className="pr-2 shrink-0">
                    <img
                      src={fileIcons[getFileExt(result.path).toLowerCase()] || fileIcons.txt}
                      className="w-5 h-5"
                      alt=""
                    />
                  </div>
                  <div className="min-w-0 flex-1 text-zinc-100 truncate" title={result.path}>
                    {getFileName(result.path)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Content preview */}
        <div className="flex-1 h-full min-w-0">
          {isIndexingActive ? (
            indexingProgress
          ) : selectedItem ? (
            <div className="pl-4 py-2 h-full min-w-0">
              {selectedItem.label === "image" ? (
                <div className="p-5 rounded-2xl h-full bg-zinc-900/60 overflow-hidden flex flex-col min-h-0">
                  <div className="w-full h-[320px] rounded-xl overflow-hidden mb-4 bg-zinc-950 flex items-center justify-center shrink-0">
                    {!brokenImagePaths.has(selectedItem.path) ? (
                      <img
                        src={toImageSrc(selectedItem.path)}
                        alt=""
                        className="max-w-full max-h-full object-contain"
                        onError={() => markImageAsBroken(selectedItem.path)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm text-center px-4">
                        Image preview unavailable. The source file may have been moved or deleted.
                      </div>
                    )}
                  </div>
                  <div className="text-zinc-300 whitespace-pre-wrap break-words overflow-y-auto overflow-x-hidden min-h-0 flex-1">
                    {selectedItem.content ?? "No preview available for this result."}
                  </div>
                  <div
                    className="text-zinc-400 text-xs mt-3 truncate shrink-0"
                    title={selectedItem.path}
                  >
                    {selectedItem.path}
                  </div>
                </div>
              ) : selectedItem.label === "video" && selectedItem.thumbnail_url ? (
                <div className="p-5 rounded-2xl h-full bg-zinc-900/60 overflow-hidden flex flex-col min-h-0">
                  <img
                    src={toImageSrc(selectedItem.thumbnail_url)}
                    alt=""
                    className="w-full h-[320px] object-contain rounded-xl bg-zinc-950 shrink-0"
                  />
                  <div className="text-zinc-300 whitespace-pre-wrap break-words overflow-y-auto overflow-x-hidden min-h-0 flex-1 mt-4">
                    {selectedItem.content ?? "No preview available for this result."}
                  </div>
                  <div
                    className="text-zinc-400 text-xs mt-3 truncate shrink-0"
                    title={selectedItem.path}
                  >
                    {selectedItem.path}
                  </div>
                </div>
              ) : (
                <div className="p-5 rounded-2xl h-full bg-zinc-700/60 overflow-hidden flex flex-col min-h-0">
                  <div className="text-zinc-300 whitespace-pre-wrap break-words overflow-y-auto overflow-x-hidden min-h-0 flex-1">
                    {selectedItem.content ?? "No preview available for this result."}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500">
              {allResults.length > 0
                ? "Select a file to view its content"
                : "Search for something to see results"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Results;
