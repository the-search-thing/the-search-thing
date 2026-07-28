import { useEffect, useState } from "react";
import type { SearchResultItem } from "../../types/types";
import { useConveyor } from "../../hooks/use-conveyor";

type ResultsPreviewProps = {
  selectedItem: SearchResultItem | null;
  hasResults: boolean;
};

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; content: string; truncated: boolean }
  | { status: "error"; message: string };

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export default function ResultsPreview({ selectedItem, hasResults }: ResultsPreviewProps) {
  const search = useConveyor("search");
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });

  useEffect(() => {
    if (!selectedItem) {
      setPreview({ status: "idle" });
      return;
    }

    let cancelled = false;
    setPreview({ status: "loading" });

    void search
      .previewFile(selectedItem.relativePath)
      .then((result) => {
        if (cancelled) return;
        setPreview({
          status: "ready",
          content: result.content,
          truncated: result.truncated,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setPreview({ status: "error", message: formatError(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [search, selectedItem]);

  if (!selectedItem) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {hasResults ? "Select a file to view its content" : "Search for something to see results"}
      </div>
    );
  }

  return (
    <div className="h-full min-w-0 py-2 pl-4">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-muted/60 p-5">
        <div className="mb-3 shrink-0 text-sm font-medium text-foreground">
          {selectedItem.fileName}
          {selectedItem.lineNumber ? `:${selectedItem.lineNumber}` : ""}
        </div>
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto whitespace-pre-wrap wrap-break-word text-foreground">
          {preview.status === "loading" && (
            <span className="text-muted-foreground">Loading preview…</span>
          )}
          {preview.status === "error" && (
            <span className="text-destructive">{preview.message}</span>
          )}
          {preview.status === "ready" && preview.content}
          {preview.status === "idle" && selectedItem.lineContent}
        </div>
        <div
          className="mt-3 shrink-0 truncate text-xs text-muted-foreground"
          title={selectedItem.relativePath}
        >
          {selectedItem.relativePath}
          {preview.status === "ready" && preview.truncated ? " · truncated" : ""}
        </div>
      </div>
    </div>
  );
}
