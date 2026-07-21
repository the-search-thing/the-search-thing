import { render } from "preact";
import { useRef, useState } from "preact/hooks";
import {
  searchFiles,
  searchGrep,
  type FileSearchResult,
  type GrepSearchResult,
} from "./api";
import "./style.css";

type Tab = "files" | "grep";

type SearchResults =
  | { kind: "files"; data: FileSearchResult }
  | { kind: "grep"; data: GrepSearchResult };

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export function App() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("files");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function cancelInFlight() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  async function onSearch(event: Event) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    cancelInFlight();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    setError(null);

    try {
      if (activeTab === "files") {
        const data = await searchFiles(trimmed, 50, signal);
        if (signal.aborted) return;
        setResults({ kind: "files", data });
      } else {
        const data = await searchGrep(trimmed, 50, signal);
        if (signal.aborted) return;
        setResults({ kind: "grep", data });
      }
    } catch (cause) {
      if (signal.aborted) return;
      setResults(null);
      setError(formatError(cause));
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }

  function switchTab(tab: Tab) {
    cancelInFlight();
    setActiveTab(tab);
    setResults(null);
    setError(null);
    setLoading(false);
  }

  return (
    <div class="app">
      <header class="header">
        <h1>the-search-thing</h1>
        <p>Search files and content in your workspace</p>
      </header>

      <nav class="tabs" aria-label="Search mode">
        <button
          type="button"
          class={activeTab === "files" ? "tab active" : "tab"}
          onClick={() => switchTab("files")}
        >
          Files
        </button>
        <button
          type="button"
          class={activeTab === "grep" ? "tab active" : "tab"}
          onClick={() => switchTab("grep")}
        >
          Grep
        </button>
      </nav>

      <form class="search" onSubmit={onSearch}>
        <input
          type="search"
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
          placeholder={activeTab === "files" ? "Search by file name…" : "Search file contents…"}
          autofocus
        />
        <button type="submit" disabled={loading || !query.trim()}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p class="status error">{error}</p>}
      {loading && <p class="status">Searching…</p>}

      {!loading && !error && results?.kind === "files" && (
        <section class="results">
          <p class="meta">
            {results.data.totalMatched} match{results.data.totalMatched === 1 ? "" : "es"} for “
            {results.data.query}”
          </p>
          {results.data.items.length === 0 ? (
            <p class="empty">No files found.</p>
          ) : (
            <ul>
              {results.data.items.map((item) => (
                <li key={item.relativePath}>
                  <span class="file-name">{item.fileName}</span>
                  <span class="file-path">{item.relativePath}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!loading && !error && results?.kind === "grep" && (
        <section class="results">
          <p class="meta">
            {results.data.totalMatched} match{results.data.totalMatched === 1 ? "" : "es"} for “
            {results.data.query}”
          </p>
          {results.data.items.length === 0 ? (
            <p class="empty">No content matches found.</p>
          ) : (
            <ul>
              {results.data.items.map((item) => (
                <li key={`${item.relativePath}:${item.lineNumber}`}>
                  <div class="grep-loc">
                    <span class="file-path">{item.relativePath}</span>
                    <span class="line-number">:{item.lineNumber}</span>
                  </div>
                  <pre class="line-content">{item.lineContent}</pre>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

render(<App />, document.getElementById("app")!);
