import * as React from "react";
import { useEffect, useState } from "react";
import { FileX } from "lucide-react";
import type { ResultProps, SearchResultItem } from "../types/types";
import { useConveyor } from "../hooks/use-conveyor";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./ui/resizable";
import ResultsSidebar from "./results/ResultsSidebar";
import ResultsPreview from "./results/ResultsPreview";

const SIDEBAR_LAYOUT_KEY = "results-sidebar-layout";

const readDefaultLayout = (): Record<string, number> | undefined => {
  try {
    const raw = localStorage.getItem(SIDEBAR_LAYOUT_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "sidebar" in parsed &&
      "preview" in parsed &&
      typeof parsed.sidebar === "number" &&
      typeof parsed.preview === "number"
    ) {
      return { sidebar: parsed.sidebar, preview: parsed.preview };
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const Results: React.FC<ResultProps> = ({
  searchResults,
  query,
  hasSearched,
  recentSearches = [],
  onRecentSearchSelect,
}) => {
  const [selectedItem, setSelectedItem] = useState<SearchResultItem | null>(null);
  const search = useConveyor("search");
  const allResults = searchResults?.items ?? [];

  const [defaultLayout] = useState(readDefaultLayout);

  useEffect(() => {
    setSelectedItem(null);
  }, [searchResults]);

  if (hasSearched && allResults.length === 0 && query) {
    return (
      <div className="flex h-full w-full flex-col items-center gap-4 pt-30">
        <FileX className="size-15 opacity-55" />
        <div className="text-muted-foreground">No results for "{query}"</div>
      </div>
    );
  }

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
          showRecentSearches={!hasSearched}
          recentSearches={recentSearches}
          results={allResults}
          selectedItem={selectedItem}
          onSelectResult={setSelectedItem}
          onOpenResult={(relativePath) => void search.openFile(relativePath)}
          onRecentSearchSelect={onRecentSearchSelect}
        />
      </ResizablePanel>
      <ResizableHandle className="bg-border" />
      <ResizablePanel id="preview" minSize={300} className="min-h-0 min-w-0">
        <ResultsPreview selectedItem={selectedItem} hasResults={allResults.length > 0} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

export default Results;
