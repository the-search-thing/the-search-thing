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

const getFileExt = (path: string) => {
  const parts = path.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

const isSameResult = (left: SearchResultItem | null, right: SearchResultItem): boolean => {
  if (!left) return false;
  if (left.relativePath !== right.relativePath) return false;
  return left.lineNumber === right.lineNumber;
};

const RecentSearches = (props: {
  items: SearchHistoryEntry[];
  onSelect?: (query: string) => void;
}) =>
  props.items.length > 0 ? (
    props.items.map((item) => (
      <button
        key={item.id}
        type="button"
        onClick={() => props.onSelect?.(item.search_string)}
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
  );

const ResultRow = (props: {
  item: SearchResultItem;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) => (
  <div
    tabIndex={0}
    onClick={props.onSelect}
    onDoubleClick={props.onOpen}
    onKeyDown={(event) => {
      if (event.key === "Enter") props.onOpen();
    }}
    onMouseDown={(event) => {
      if (event.metaKey) {
        props.onOpen();
      } else if (event.ctrlKey) {
        props.onOpen();
      }
    }}
    className={cn(
      "flex cursor-pointer flex-row rounded-xl border-b border-border p-2 transition-colors hover:bg-accent",
      props.selected && "bg-accent",
    )}
  >
    <div className="shrink-0 pr-2">
      <img
        src={fileIcons[getFileExt(props.item.relativePath).toLowerCase()] || fileIcons.txt}
        className="size-5"
        alt=""
      />
    </div>
    <div className="min-w-0 flex-1">
      <div className="truncate text-foreground" title={props.item.relativePath}>
        {props.item.fileName}
        {props.item.lineNumber ? `:${props.item.lineNumber}` : ""}
      </div>
      {props.item.lineContent && (
        <div className="truncate text-xs text-muted-foreground">{props.item.lineContent}</div>
      )}
    </div>
  </div>
);

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
          <RecentSearches items={recentSearches} onSelect={onRecentSearchSelect} />
        ) : (
          results.map((result, index) => (
            <ResultRow
              key={`${result.relativePath}-${result.lineNumber ?? 0}-${index}`}
              item={result}
              selected={isSameResult(selectedItem, result)}
              onSelect={() => onSelectResult(result)}
              onOpen={() => onOpenResult(result.relativePath)}
            />
          ))
        )}
      </div>
    </div>
  );
}
