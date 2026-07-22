import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import * as fileIcons from "@/resources/filetype icons";
import type { SearchHistoryEntry, SearchResultItem } from "../../types/types";

type ResultsSidebarProps = {
  showRecentSearches: boolean;
  recentSearches: SearchHistoryEntry[];
  results: SearchResultItem[];
  selectedItem: SearchResultItem | null;
  onSelectResult: (result: SearchResultItem) => void;
  onOpenResult: (path: string) => void;
  onRecentSearchSelect?: (query: string) => void;
};

const getFileName = (path: string) => {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
};

const getFileExt = (path: string) => {
  const parts = path.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

export default function ResultsSidebar({
  showRecentSearches,
  recentSearches,
  results,
  selectedItem,
  onSelectResult,
  onOpenResult,
  onRecentSearchSelect,
}: ResultsSidebarProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex-none p-1">
        <h3 className="text-[0.8rem] font-medium text-muted-foreground">
          {showRecentSearches ? "Recent Searches" : "Results"}
        </h3>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-2">
        {showRecentSearches ? (
          recentSearches.length > 0 ? (
            recentSearches.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onRecentSearchSelect?.(item.search_string)}
                className="flex cursor-pointer items-center gap-2 rounded-xl border-b border-border p-2 text-left transition-colors hover:bg-accent"
              >
                <Search className="size-4 text-muted-foreground" />
                <span className="truncate text-foreground" title={item.search_string}>
                  {item.search_string}
                </span>
              </button>
            ))
          ) : (
            <div className="p-2 text-sm text-muted-foreground">No recent searches yet.</div>
          )
        ) : (
          results.map((result, index) => (
            <div
              key={`${result.path}-${result.label}-${index}`}
              tabIndex={0}
              onClick={() => onSelectResult(result)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onOpenResult(result.path);
                }
              }}
              onMouseDown={(e) => {
                if (e.metaKey || e.ctrlKey) {
                  onOpenResult(result.path);
                }
              }}
              className={cn(
                "flex cursor-pointer flex-row rounded-xl border-b border-border p-2 transition-colors hover:bg-accent",
                selectedItem?.path === result.path && "bg-accent",
              )}
            >
              <div className="shrink-0 pr-2">
                <img
                  src={fileIcons[getFileExt(result.path).toLowerCase()] || fileIcons.txt}
                  className="size-5"
                  alt=""
                />
              </div>
              <div className="min-w-0 flex-1 truncate text-foreground" title={result.path}>
                {getFileName(result.path)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
