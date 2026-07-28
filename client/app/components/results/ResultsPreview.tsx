import type { SearchResultItem } from "../../types/types";

type ResultsPreviewProps = {
  selectedItem: SearchResultItem | null;
  hasResults: boolean;
};

export default function ResultsPreview({ selectedItem, hasResults }: ResultsPreviewProps) {
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
	{/* 
	    here we need to add a file preview, fine if truncated
	    */}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto whitespace-pre-wrap wrap-break-word text-foreground">
          {selectedItem.lineContent ?? "Open this file to view its contents."}
        </div>
        <div
          className="mt-3 shrink-0 truncate text-xs text-muted-foreground"
          title={selectedItem.relativePath}
        >
          {selectedItem.relativePath}
        </div>
      </div>
    </div>
  );
}
