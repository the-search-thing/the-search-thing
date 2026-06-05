import { useState, useRef, useEffect, useCallback } from "react";
import { useConveyor } from "../hooks/use-conveyor";
import { Button } from "./ui/button";
import { Info, CornerDownLeft } from "lucide-react";
import { useAppContext } from "../AppContext";

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

export default function Footer() {
  const search = useConveyor("search");
  const [isIndexing, setIsIndexing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Queue state — mirrors the pattern in Results.tsx
  const dirsQueuedRef = useRef<string[]>([]);
  const currentDirIndexRef = useRef(0);
  const [dirsQueued, setDirsQueuedState] = useState<string[]>([]);
  const [currentDirIndex, setCurrentDirIndexState] = useState(0);
  const [dirStatuses, setDirStatuses] = useState<DirStatus[]>([]);

  const setDirsQueued = (dirs: string[]) => {
    dirsQueuedRef.current = dirs;
    setDirsQueuedState(dirs);
  };
  const setCurrentDirIndex = (idx: number) => {
    currentDirIndexRef.current = idx;
    setCurrentDirIndexState(idx);
  };

  const {
    currentJobId,
    setCurrentJobId,
    indexingLocation,
    setIndexingLocation,
    setDirIndexed,
    jobStatus,
    setJobStatus,
    setAwaitingIndexing,
  } = useAppContext();

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsPopoverOpen(false);
      }
    };

    if (isPopoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isPopoverOpen]);

  // Poll job status every 2 seconds — only when footer owns the job
  useEffect(() => {
    if (!currentJobId || indexingLocation !== "footer") {
      // Only clear jobStatus if Results isn't using it
      if (!currentJobId && indexingLocation !== "results") setJobStatus(null);
      return;
    }

    let isActive = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const clearAll = () => {
      setCurrentJobId(null);
      setIndexingLocation(null);
      setDirIndexed(null);
      setJobStatus(null);
      setAwaitingIndexing(false);
      setDirsQueued([]);
      setCurrentDirIndex(0);
      setDirStatuses([]);
    };

    const fetchStatus = async () => {
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
            // Advance to next dir in queue
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
              }
            } catch (err) {
              console.error("Failed to start next indexing job:", err);
              const delay = 5000;
              timeoutId = setTimeout(() => { if (isActive) clearAll(); }, delay);
            }
          } else {
            // All dirs done — clear after brief display
            const delay = status.status === "completed" ? 3000 : 5000;
            timeoutId = setTimeout(() => { if (isActive) clearAll(); }, delay);
          }
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
    indexingLocation,
    search,
    setCurrentJobId,
    setIndexingLocation,
    setDirIndexed,
    setJobStatus,
    setAwaitingIndexing,
  ]);

  const handleStartIndexing = useCallback(async () => {
    const dirs = await search.openFileDialog();

    if (!dirs || dirs.length === 0) return;

    setIsIndexing(true);
    setErrorMessage("");
    try {
      const indexRes = await search.index(dirs[0]);
      if (indexRes.success && indexRes.job_id) {
        const statuses: DirStatus[] = dirs.map((_, i) => (i === 0 ? "indexing" : "queued"));
        setDirsQueued(dirs);
        setCurrentDirIndex(0);
        setDirStatuses(statuses);
        setCurrentJobId(indexRes.job_id);
        setDirIndexed(dirs[0]);
        setIndexingLocation("footer");
        setErrorMessage("");
      } else if (!indexRes.job_id) {
        setErrorMessage("Indexing started but no job ID was returned");
      } else {
        setErrorMessage("No response from indexing");
      }
    } catch (error) {
      console.error("Error indexing files:", error);
      setErrorMessage(`Indexing failed: ${error}`);
    } finally {
      setIsIndexing(false);
    }
  }, [search]);

  const renderStatus = () => {
    if (indexingLocation === "footer" && (jobStatus || currentJobId)) {
      const multiDir = dirsQueued.length > 1;
      const queueLabel = multiDir ? ` (${currentDirIndex + 1}/${dirsQueued.length})` : "";

      if (jobStatus?.status === "failed") {
        return (
          <span className="text-red-400 text-xs truncate max-w-[300px]">
            Failed{queueLabel}{jobStatus.error ? `: ${jobStatus.error}` : ""}
          </span>
        );
      }

      if (jobStatus?.status === "completed" && !currentJobId) {
        // All done (cleared by polling effect) — show briefly before unmounting
        return (
          <span className="text-green-400 text-xs">
            {jobStatus.message || "Indexing complete"}
          </span>
        );
      }

      const phaseText = jobStatus ? (phaseLabels[jobStatus.phase] || jobStatus.phase) : "Starting…";
      return (
        <span className="text-zinc-400 text-xs truncate max-w-[300px]">
          {phaseText}{queueLabel}
          {jobStatus?.message && (
            <span className="text-zinc-500 ml-1.5">- {jobStatus.message}</span>
          )}
        </span>
      );
    }

    if (isIndexing) {
      return <span className="opacity-75 text-zinc-100 text-sm">Indexing...</span>;
    }

    if (errorMessage) {
      return <span className="text-red-500 text-xs truncate max-w-[300px]">{errorMessage}</span>;
    }

    return null;
  };

  return (
    <div className="flex flex-row justify-between items-center w-full h-full">
      <div className="relative" ref={popoverRef}>
        <Button
          variant="hoverlessTransparent"
          className="p-0.5 w-auto h-auto rounded-full cursor-pointer transition-colors"
          onClick={() => setIsPopoverOpen(!isPopoverOpen)}
        >
          <Info className="w-3 h- opacity-75" />
        </Button>

        {isPopoverOpen && (
          <div className="absolute left-0 bottom-full mb-2 z-[60] min-w-[150px] rounded-lg bg-zinc-900/70 p-3 text-zinc-100 shadow-xl backdrop-blur-sm border border-zinc-600">
            <div className="text-xs font-medium mb-1">the-search-thing</div>
            <div className="text-[10px] text-zinc-400">Version 0.1.0</div>
            {/* Arrow pointing down */}
            <div className="absolute left-3 -bottom-1 h-2 w-2 rotate-45 bg-zinc-900/95 ring-1 ring-white/10"></div>
          </div>
        )}
      </div>

      <div className="text-sm flex items-center flex-1 justify-center px-4">{renderStatus()}</div>

      <Button
        variant="transparent"
        size="sm"
        onClick={handleStartIndexing}
        disabled={isIndexing || !!currentJobId}
        data-index-button="true"
      >
        Index <CornerDownLeft className="w-5 h-6 opacity-75" />
      </Button>
    </div>
  );
}
