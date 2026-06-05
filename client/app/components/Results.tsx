import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { FileX, CheckCircle2, XCircle, FolderOpen, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResultProps, SearchResultItem } from "../types/types";
import * as fileIcons from "@/resources/filetype icons";
import { useConveyor } from "../hooks/use-conveyor";
import { useAppContext } from "../AppContext";

type ResultItem = SearchResultItem;
type DirStatus = "queued" | "indexing" | "done" | "error";

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

  // Queue state — local, only Results manages this
  const [dirsQueued, setDirsQueuedState] = useState<string[]>([]);
  const [currentDirIndex, setCurrentDirIndexState] = useState(0);
  const [dirStatuses, setDirStatuses] = useState<DirStatus[]>([]);
  const dirsQueuedRef = useRef<string[]>([]);
  const currentDirIndexRef = useRef(0);

  const hasOpenedDialogRef = useRef(false);
  // Mirror of currentJobId so async handlers read the latest value, not the
  // closure captured at call time (e.g. while the file dialog is open).
  const currentJobIdRef = useRef<string | null>(null);
  const search = useConveyor("search");

  const setDirsQueued = (dirs: string[]) => {
    dirsQueuedRef.current = dirs;
    setDirsQueuedState(dirs);
  };

  const setCurrentDirIndex = (idx: number) => {
    currentDirIndexRef.current = idx;
    setCurrentDirIndexState(idx);
  };

  const {
    awaitingIndexing,
    currentJobId,
    setCurrentJobId,
    indexingLocation,
    setIndexingLocation,
    setDirIndexed,
    setAwaitingIndexing,
    jobStatus,
    setJobStatus,
  } = useAppContext();

  const allResults = searchResults?.results || [];

  // Keep the ref in lockstep with context state.
  useEffect(() => {
    currentJobIdRef.current = currentJobId;
  }, [currentJobId]);

  // Mark every still-pending dir from `fromIdx` onward as failed (terminal) and
  // drop the active job. This guarantees the redirect effect's all-terminal
  // guard can fire, so a failed queue advancement never traps the user.
  const failRemainingDirs = (fromIdx: number) => {
    setDirStatuses((prev) => {
      const next = [...prev];
      for (let i = Math.max(0, fromIdx); i < next.length; i++) {
        if (next[i] !== "done" && next[i] !== "error") next[i] = "error";
      }
      return next;
    });
    setCurrentJobId(null);
  };

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

  // Results-owned polling — only runs when this component owns the job
  useEffect(() => {
    if (indexingLocation !== "results" || !currentJobId) return;

    let isActive = true;
    let intervalId: number;

    const fetchStatus = async () => {
      if (!isActive) return;
      try {
        const status = await search.indexStatus(currentJobId);
        if (!isActive) return;
        setJobStatus(status);

        if (status.status === "completed" || status.status === "failed") {
          clearInterval(intervalId);

          const activeDirIdx = currentDirIndexRef.current;
          const nextStatusVal: DirStatus = status.status === "completed" ? "done" : "error";
          setDirStatuses((prev) => {
            const next = [...prev];
            next[activeDirIdx] = nextStatusVal;
            return next;
          });

          const nextIdx = activeDirIdx + 1;
          const queue = dirsQueuedRef.current;

          if (nextIdx < queue.length) {
            // Advance to next dir regardless of current dir's outcome
            try {
              const nextDir = queue[nextIdx];
              const indexRes = await search.index(nextDir);
              if (!isActive) return;
              if (indexRes.success && indexRes.job_id) {
                setCurrentDirIndex(nextIdx);
                setCurrentJobId(indexRes.job_id);
                setDirIndexed(nextDir);
                setJobStatus(null);
                setDirStatuses((prev) => {
                  const next = [...prev];
                  next[nextIdx] = "indexing";
                  return next;
                });
              } else {
                // Backend resolved without a usable job — fail the rest of the
                // queue so the redirect effect can recover the UI.
                console.error("Queue advancement failed: missing success/job_id", indexRes);
                failRemainingDirs(nextIdx);
              }
            } catch (err) {
              console.error("Failed to start next indexing job:", err);
              if (isActive) failRemainingDirs(nextIdx);
            }
          } else {
            // All dirs processed — null the job so the completion state renders.
            // A dedicated effect handles the redirect back to the search UI.
            setCurrentJobId(null);
          }
        }
      } catch (err) {
        console.error("Results polling error:", err);
      }
    };

    fetchStatus();
    intervalId = window.setInterval(fetchStatus, 2000);

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [currentJobId, indexingLocation]);

  // Auto-redirect back to the search/results UI once the whole queue is done.
  // Owns its own timer so it isn't cancelled by the polling effect's lifecycle.
  useEffect(() => {
    if (indexingLocation !== "results" || !awaitingIndexing) return;
    if (currentJobId) return;

    const isTerminal = (s: DirStatus) => s === "done" || s === "error";
    const allDone =
      dirsQueued.length > 0 &&
      dirStatuses.length === dirsQueued.length &&
      dirStatuses.every(isTerminal);
    if (!allDone) return;

    const timer = setTimeout(() => {
      setDirsQueued([]);
      setCurrentDirIndex(0);
      setDirStatuses([]);
      setJobStatus(null);
      setDirIndexed(null);
      setIndexingLocation(null);
      setAwaitingIndexing(false);
      setHasInitiatedIndexing(false);
      hasOpenedDialogRef.current = false;
    }, 2500);

    return () => clearTimeout(timer);
  }, [indexingLocation, awaitingIndexing, currentJobId, dirsQueued, dirStatuses]);

  const handleOpen = (filePath: string) => {
    search.openFile(filePath);
  };

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
    return `localimg://preview?path=${encodeURIComponent(path)}`;
  };

  const markImageAsBroken = (path: string) => {
    setBrokenImagePaths((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  };

  // Reset all queue + indexing state and return to the search/results UI.
  const abortIndexing = () => {
    setDirsQueued([]);
    setCurrentDirIndex(0);
    setDirStatuses([]);
    setCurrentJobId(null);
    setJobStatus(null);
    setDirIndexed(null);
    setIndexingLocation(null);
    setAwaitingIndexing(false);
    setHasInitiatedIndexing(false);
    hasOpenedDialogRef.current = false;
    onIndexingCancelled?.();
  };

  const startIndexingQueue = async (dirs: string[]) => {
    if (dirs.length === 0) {
      abortIndexing();
      return;
    }
    const statuses: DirStatus[] = dirs.map((_, i) => (i === 0 ? "indexing" : "queued"));
    setDirsQueued(dirs);
    setCurrentDirIndex(0);
    setDirStatuses(statuses);
    try {
      const indexRes = await search.index(dirs[0]);
      if (indexRes.success && indexRes.job_id) {
        setCurrentJobId(indexRes.job_id);
        setDirIndexed(dirs[0]);
        setIndexingLocation("results");
      } else {
        // index() resolved but backend gave no usable job — recover to search UI.
        console.error("Indexing did not start: missing success/job_id", indexRes);
        abortIndexing();
      }
    } catch (error) {
      console.error("Error starting indexing:", error);
      abortIndexing();
    }
  };

  const handleStartIndexing = useCallback(async () => {
    const dirs = await search.openFileDialog();
    if (!dirs || dirs.length === 0) {
      onIndexingCancelled?.();
      setAwaitingIndexing(false);
      setHasInitiatedIndexing(false);
      hasOpenedDialogRef.current = false;
      return;
    }
    await startIndexingQueue(dirs);
  }, [search, onIndexingCancelled, setCurrentJobId, setIndexingLocation, setDirIndexed, setAwaitingIndexing]);

  const handleAddMoreDirs = async () => {
    const dirs = await search.openFileDialog();
    if (!dirs || dirs.length === 0) return;

    const startIdx = dirsQueuedRef.current.length;
    const newDirs = [...dirsQueuedRef.current, ...dirs];
    setDirsQueued(newDirs);
    setDirStatuses((prev) => [...prev, ...dirs.map((): DirStatus => "queued")]);

    // Read the live job id via ref: the dialog may have been open long enough
    // for the last job to finish (state → null) while the closure value is stale.
    // If a job is still running, the polling effect advances into the appended
    // dirs automatically; only kick off indexing when the queue is idle.
    if (currentJobIdRef.current) return;

    try {
      const firstNewDir = dirs[0];
      const indexRes = await search.index(firstNewDir);
      if (indexRes.success && indexRes.job_id) {
        setCurrentDirIndex(startIdx);
        setCurrentJobId(indexRes.job_id);
        setDirIndexed(firstNewDir);
        setJobStatus(null);
        setIndexingLocation("results");
        setDirStatuses((prev) => {
          const next = [...prev];
          next[startIdx] = "indexing";
          return next;
        });
      } else {
        // No usable job — mark the appended dirs terminal so the redirect fires.
        console.error("Adding dirs failed: missing success/job_id", indexRes);
        failRemainingDirs(startIdx);
      }
    } catch (error) {
      console.error("Error starting indexing for added dirs:", error);
      failRemainingDirs(startIdx);
    }
  };

  useEffect(() => {
    if (awaitingIndexing && !currentJobId && !hasInitiatedIndexing && !hasOpenedDialogRef.current) {
      hasOpenedDialogRef.current = true;
      setHasInitiatedIndexing(true);
      handleStartIndexing();
    }
  }, [awaitingIndexing, currentJobId, hasInitiatedIndexing, handleStartIndexing]);

  const progressBar = (
    label: string,
    found: number,
    indexed: number,
    errors: number,
    skipped: number,
  ) => {
    if (found === 0 && indexed === 0) return null;
    const pct = found > 0 ? Math.round((indexed / found) * 100) : 0;
    return (
      <div className="w-full">
        <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
          <span className="text-zinc-300">{label}</span>
          <span className="tabular-nums">
            {indexed}/{found}
            {errors > 0 && <span className="text-red-400 ml-1.5">· {errors} err</span>}
            {skipped > 0 && <span className="text-yellow-600 ml-1.5">· {skipped} skip</span>}
          </span>
        </div>
        <div className="w-full h-1 bg-zinc-700/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  // Indexing UI
  if (indexingLocation === "results" && awaitingIndexing) {
    const isTerminal = (s: DirStatus) => s === "done" || s === "error";
    const allDone =
      dirsQueued.length > 0 &&
      !currentJobId &&
      dirStatuses.length === dirsQueued.length &&
      dirStatuses.every(isTerminal);
    const allComplete = allDone && dirStatuses.every((s) => s === "done");
    const hasFailed = dirStatuses.some((s) => s === "error");
    const spinning = !!currentJobId && (!jobStatus || (jobStatus.status !== "completed" && jobStatus.status !== "failed"));

    return (
      <div className="flex flex-col w-full h-full p-5 gap-4 overflow-hidden">
        {/* Phase header + Add More on right */}
        <div className="flex items-center justify-between gap-2.5 flex-none">
          <div className="flex items-center gap-2.5">
            {spinning && (
              <svg className="animate-spin h-4 w-4 text-blue-400 flex-none" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {allComplete && <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-none" />}
            {allDone && !allComplete && <XCircle className="h-4 w-4 text-red-400 flex-none" />}
            {!allDone && hasFailed && <XCircle className="h-3.5 w-3.5 text-red-400 flex-none opacity-60" />}
            <span className="text-zinc-200 text-sm font-medium">
              {allDone
                ? allComplete
                  ? `${dirsQueued.length === 1 ? "Directory" : `All ${dirsQueued.length} directories`} indexed`
                  : `Done — ${dirStatuses.filter((s) => s === "error").length} director${dirStatuses.filter((s) => s === "error").length === 1 ? "y" : "ies"} failed`
                : jobStatus
                ? phaseLabels[jobStatus.phase] || jobStatus.phase
                : "Starting…"}
            </span>
            {dirsQueued.length > 1 && !allDone && (
              <span className="text-zinc-600 text-xs">
                {currentDirIndex + 1} / {dirsQueued.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleAddMoreDirs}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-600 hover:border-zinc-400 px-2.5 py-1 rounded-md transition-colors flex-none"
          >
            <Plus className="h-3 w-3" />
            Add directories
          </button>
        </div>

        {/* Directory list */}
        <div className="flex flex-col gap-1.5 flex-none max-h-[200px] overflow-y-auto">
          {dirsQueued.map((dir, idx) => {
            const status: DirStatus = dirStatuses[idx] ?? "queued";
            return (
              <div
                key={`${dir}-${idx}`}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs",
                  status === "indexing"
                    ? "bg-blue-950/30 border-blue-800/40"
                    : status === "done"
                    ? "bg-zinc-800/30 border-zinc-700/30"
                    : status === "error"
                    ? "bg-red-950/20 border-red-800/30"
                    : "bg-zinc-800/20 border-zinc-700/20",
                )}
              >
                {status === "indexing" && (
                  <svg className="animate-spin h-3 w-3 text-blue-400 flex-none" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {status === "done" && <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-none" />}
                {status === "error" && <XCircle className="h-3 w-3 text-red-400 flex-none" />}
                {status === "queued" && (
                  <div className="h-3 w-3 rounded-full border border-zinc-600 flex-none" />
                )}
                <FolderOpen className="h-3 w-3 text-zinc-500 flex-none" />
                <span
                  className={cn(
                    "font-mono truncate flex-1",
                    status === "indexing"
                      ? "text-zinc-200"
                      : status === "done"
                      ? "text-zinc-500"
                      : status === "error"
                      ? "text-red-400"
                      : "text-zinc-600",
                  )}
                  title={dir}
                >
                  {dir}
                </span>
                <span
                  className={cn(
                    "text-[10px] flex-none capitalize",
                    status === "indexing"
                      ? "text-blue-400"
                      : status === "done"
                      ? "text-emerald-600"
                      : status === "error"
                      ? "text-red-500"
                      : "text-zinc-600",
                  )}
                >
                  {status}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress bars — centered */}
        {jobStatus && !allDone && (
          <div className="flex flex-col gap-3 w-full max-w-xs mx-auto flex-none mt-2">
            {progressBar("Text", jobStatus.text_found, jobStatus.text_indexed, jobStatus.text_errors, jobStatus.text_skipped)}
            {progressBar("Video", jobStatus.video_found, jobStatus.video_indexed, jobStatus.video_errors, jobStatus.video_skipped)}
            {progressBar("Image", jobStatus.image_found, jobStatus.image_indexed, jobStatus.image_errors, jobStatus.image_skipped)}
            {jobStatus.message && (
              <div className="text-zinc-600 text-xs text-center">{jobStatus.message}</div>
            )}
            {jobStatus.error && (
              <div className="text-red-400 text-xs bg-red-950/30 rounded px-2.5 py-1.5">
                {jobStatus.error}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // No results
  if (hasSearched && allResults.length === 0 && query) {
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

  const showRecentSearches = !hasSearched;

  return (
    <div className="flex items-center w-full h-full">
      <div className="flex w-full h-full">
        {/* Files list */}
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
                    className="flex items-center gap-2 p-2 rounded-xl cursor-pointer hover:bg-zinc-700/60 transition-colors border-b border-zinc-800 text-left"
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
                    if (e.key === "Enter") handleOpen(result.path);
                  }}
                  onMouseDown={(e) => {
                    if (e.metaKey || e.ctrlKey) handleOpen(result.path);
                  }}
                  className={cn(
                    "flex flex-row p-2 rounded-xl cursor-pointer hover:bg-zinc-700/60 transition-colors border-b border-zinc-800",
                    selectedItem?.path === result.path && "bg-zinc-600/70 ring-1 ring-zinc-500/40",
                  )}
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
          {selectedItem ? (
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
                  <div className="text-zinc-400 text-xs mt-3 truncate shrink-0" title={selectedItem.path}>
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
                  <div className="text-zinc-400 text-xs mt-3 truncate shrink-0" title={selectedItem.path}>
                    {selectedItem.path}
                  </div>
                </div>
              ) : (
                <div className="p-5 rounded-2xl h-full bg-zinc-900/60 overflow-hidden flex flex-col min-h-0">
                  <div className="text-zinc-300 whitespace-pre-wrap break-words overflow-y-auto overflow-x-hidden min-h-0 flex-1 text-sm font-mono leading-relaxed">
                    {selectedItem.content || (
                      <span className="text-zinc-500 italic">No preview available.</span>
                    )}
                  </div>
                  <div className="text-zinc-400 text-xs mt-3 truncate shrink-0" title={selectedItem.path}>
                    {selectedItem.path}
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
