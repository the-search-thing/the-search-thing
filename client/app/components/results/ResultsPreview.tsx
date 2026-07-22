import WhimsyLoader from "../WhimsyLoader";
import type { IndexJobStatus, SearchResultItem } from "../../types/types";

const phaseLabels: Record<string, string> = {
  scan_text: "Scanning text files",
  index_text: "Indexing text files",
  scan_video: "Scanning videos",
  index_video: "Indexing videos",
  scan_image: "Scanning images",
  index_image: "Indexing images",
  done: "Done",
};

type ResultsPreviewProps = {
  isIndexingActive: boolean;
  jobStatus: IndexJobStatus | null;
  currentJobId: string | null;
  dirIndexed: string | null;
  selectedItem: SearchResultItem | null;
  hasResults: boolean;
  brokenImagePaths: Set<string>;
  onImageError: (path: string) => void;
};

const toImageSrc = (path: string) => {
  if (!path) return "";
  if (/^(https?:|data:|blob:|res:|localimg:)/i.test(path)) return path;

  // Use a custom protocol so renderer pages served via http://localhost
  // can still load local filesystem images safely.
  return `localimg://preview?path=${encodeURIComponent(path)}`;
};

export default function ResultsPreview({
  isIndexingActive,
  jobStatus,
  currentJobId,
  dirIndexed,
  selectedItem,
  hasResults,
  brokenImagePaths,
  onImageError,
}: ResultsPreviewProps) {
  if (isIndexingActive) {
    const jobDone = jobStatus?.status === "completed" || jobStatus?.status === "failed";

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6">
        {!jobDone && <WhimsyLoader size={48} />}

        <div className="text-lg font-medium text-foreground">
          {jobStatus?.status === "completed"
            ? "Indexing complete!"
            : jobStatus?.status === "failed"
              ? "Indexing failed"
              : jobStatus
                ? phaseLabels[jobStatus.phase] || jobStatus.phase
                : "Starting indexing..."}
        </div>

        {currentJobId && dirIndexed && (
          <div className="font-mono text-xs text-muted-foreground">Directory: {dirIndexed}</div>
        )}

        {jobStatus?.message && (
          <div className="text-center text-xs text-muted-foreground">{jobStatus.message}</div>
        )}

        {jobStatus?.error && (
          <div className="rounded bg-destructive/20 px-3 py-2 text-center text-xs text-destructive">
            {jobStatus.error}
          </div>
        )}
      </div>
    );
  }

  if (!selectedItem) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {hasResults ? "Select a file to view its content" : "Search for something to see results"}
      </div>
    );
  }

  if (selectedItem.label === "image") {
    return (
      <div className="h-full min-w-0 py-2 pl-4">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-muted/60 p-5">
          <div className="mb-4 flex h-[320px] w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background">
            {!brokenImagePaths.has(selectedItem.path) ? (
              <img
                src={toImageSrc(selectedItem.path)}
                alt=""
                className="max-h-full max-w-full object-contain"
                onError={() => onImageError(selectedItem.path)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                Image preview unavailable. The source file may have been moved or deleted.
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words text-foreground">
            {selectedItem.content ?? "No preview available for this result."}
          </div>
          <div
            className="mt-3 shrink-0 truncate text-xs text-muted-foreground"
            title={selectedItem.path}
          >
            {selectedItem.path}
          </div>
        </div>
      </div>
    );
  }

  if (selectedItem.label === "video" && selectedItem.thumbnail_url) {
    return (
      <div className="h-full min-w-0 py-2 pl-4">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-muted/60 p-5">
          <img
            src={toImageSrc(selectedItem.thumbnail_url)}
            alt=""
            className="h-[320px] w-full shrink-0 rounded-xl bg-background object-contain"
          />
          <div className="mt-4 min-h-0 flex-1 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words text-foreground">
            {selectedItem.content ?? "No preview available for this result."}
          </div>
          <div
            className="mt-3 shrink-0 truncate text-xs text-muted-foreground"
            title={selectedItem.path}
          >
            {selectedItem.path}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-w-0 py-2 pl-4">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-muted/60 p-5">
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words text-foreground">
          {selectedItem.content ?? "No preview available for this result."}
        </div>
      </div>
    </div>
  );
}
