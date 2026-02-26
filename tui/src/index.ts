import {
  InputRenderable,
  InputRenderableEvents,
  ASCIIFont,
  Box,
  BoxRenderable,
  createCliRenderer,
  Text,
  type KeyEvent,
} from "@opentui/core";

const renderer = await createCliRenderer({ exitOnCtrlC: true });
const BACKEND_BASE_URL = Bun.env.BACKEND_BASE_URL ?? "http://127.0.0.1:49000";
type ScreenId = "welcome" | "main" | "search";
let currentScreen: ScreenId | null = null;

const welcomeScreen = new BoxRenderable(renderer, {
  id: "welcome",
  alignItems: "center",
  justifyContent: "center",
  flexGrow: 1,
});

welcomeScreen.add(
  Box(
    {
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column",
      gap: 1,
    },
    ASCIIFont({ font: "tiny", text: "the-search-thing" }),
    Text({ content: "what will you search for today?", fg: "#888888" }),
  ),
);
const searchScreen = new BoxRenderable(renderer, {
  id: "search",
  flexGrow: 1,
  alignItems: "center",
  justifyContent: "center",
});

const searchInput = new InputRenderable(renderer, {
  id: "search-input",
  width: 40,
  placeholder: "Search for anything...",
  backgroundColor: "#1a1a1a",
  focusedBackgroundColor: "#232323",
  textColor: "#ffffff",
  cursorColor: "#00d4ff",
});
const searchLiveValue = Text({ content: "", fg: "#a0a0a0" });
const searchResult = Text({ content: "", fg: "#00d4ff" });
const searchError = Text({ content: "", fg: "#ff6767" });
const searchResultsList = new BoxRenderable(renderer, {
  id: "search-results-list",
  flexDirection: "column",
  gap: 0,
});

searchScreen.add(
  Box(
    {
      width: 64,
      flexDirection: "column",
      gap: 1,
      borderStyle: "rounded",
      padding: 1,
      title: " Search ",
    },
    searchInput,
    searchLiveValue,
    searchResult,
    searchError,
    Box(
      {
        borderStyle: "single",
        padding: 1,
        flexDirection: "column",
        gap: 0,
        maxHeight: 14,
      },
      Text({ content: "Results", fg: "#b0b0b0" }),
      searchResultsList,
    ),
  ),
);

searchInput.on(InputRenderableEvents.INPUT, (value: string) => {
  searchLiveValue.content = value.length > 0 ? `Live: ${value}` : "";
});

searchInput.on(InputRenderableEvents.CHANGE, (value: string) => {
  searchResult.content = value.length > 0 ? `Committed: ${value}` : "";
  searchError.content = "";
});

type SearchResultItem = {
  label: string;
  path: string;
  content?: string | null;
  thumbnail_url?: string | null;
};

const fileNameFromPath = (path: string): string => {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
};

const excerpt = (value: string | null | undefined, max = 90): string | null => {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, max - 3)}...`;
};

const clearResultsList = () => {
  const children = searchResultsList.getChildren();
  for (const child of children) {
    searchResultsList.remove(child.id);
  }
};

const renderResults = (items: SearchResultItem[]) => {
  clearResultsList();
  if (items.length === 0) {
    searchResultsList.add(
      Text({ content: "No results found.", fg: "#777777" }),
    );
    return;
  }

  const visible = items.slice(0, 8);
  visible.forEach((item, index) => {
    const label = item.label || "unknown";
    const name = fileNameFromPath(item.path);
    searchResultsList.add(
      Text({ content: `${index + 1}. [${label}] ${name}`, fg: "#efefef" }),
    );
    searchResultsList.add(Text({ content: `   ${item.path}`, fg: "#666666" }));
    const snippet = excerpt(item.content);
    if (snippet) {
      searchResultsList.add(Text({ content: `   ${snippet}`, fg: "#8f8f8f" }));
    }
  });

  if (items.length > visible.length) {
    searchResultsList.add(
      Text({
        content: `... and ${items.length - visible.length} more`,
        fg: "#777777",
      }),
    );
  }
};

const extractSearchResults = (payload: unknown): SearchResultItem[] => {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  if (!Array.isArray(obj.results)) return [];

  const parsed: SearchResultItem[] = [];
  for (const raw of obj.results) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const label = typeof entry.label === "string" ? entry.label : "unknown";
    const path = typeof entry.path === "string" ? entry.path : "";
    if (!path) continue;

    parsed.push({
      label,
      path,
      content: typeof entry.content === "string" ? entry.content : null,
      thumbnail_url:
        typeof entry.thumbnail_url === "string" ? entry.thumbnail_url : null,
    });
  }

  return parsed;
};

let lastSubmitKey = "";
let lastSubmitAt = 0;

const runSearch = async (rawValue: string) => {
  const query = rawValue.trim();
  if (query.length === 0) {
    searchResult.content = "";
    searchError.content = "Enter a search query.";
    clearResultsList();
    return;
  }

  searchError.content = "";
  searchResult.content = `Searching for: "${query}"...`;

  try {
    const endpoint = new URL("/api/search", BACKEND_BASE_URL);
    endpoint.searchParams.set("q", query);

    const response = await fetch(endpoint.toString());
    if (!response.ok) {
      searchResult.content = "";
      searchError.content = `Search failed (${response.status}).`;
      clearResultsList();
      return;
    }

    const payload: unknown = await response.json();
    const items = extractSearchResults(payload);
    renderResults(items);
    searchResult.content = `Search complete: ${items.length} result(s) for "${query}".`;
  } catch {
    searchResult.content = "";
    searchError.content = `Could not reach ${BACKEND_BASE_URL}. Is backend/app.py running?`;
    clearResultsList();
  }
};

searchInput.on(InputRenderableEvents.ENTER, (value: string) => {
  const now = Date.now();
  const submitKey = `enter-event:${value}`;
  if (submitKey === lastSubmitKey && now - lastSubmitAt < 200) return;
  lastSubmitKey = submitKey;
  lastSubmitAt = now;
  void runSearch(value);
});

renderer.keyInput.on("keypress", (key: KeyEvent) => {
  if (currentScreen !== "search") return;
  if (key.name !== "return" && key.name !== "enter") return;
  key.preventDefault();
  const now = Date.now();
  const submitKey = `keypress:${searchInput.value}`;
  if (submitKey === lastSubmitKey && now - lastSubmitAt < 200) return;
  lastSubmitKey = submitKey;
  lastSubmitAt = now;
  void runSearch(searchInput.value);
});

const container = new BoxRenderable(renderer, {
  id: "container",
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  height: "100%",
});

const leftPanel = new BoxRenderable(renderer, {
  id: "left",
  flexGrow: 1,
  height: "100%",
  backgroundColor: "#444",
});

const rightPanel = new BoxRenderable(renderer, {
  id: "right",
  width: 20,
  height: "100%",
  backgroundColor: "#000",
});
container.add(rightPanel);
container.add(leftPanel);

const screens = {
  welcome: welcomeScreen,
  main: container,
  search: searchScreen,
} satisfies Record<ScreenId, BoxRenderable>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const animateOpacity = (
  renderable: BoxRenderable,
  from: number,
  to: number,
  durationMs: number,
) =>
  new Promise<void>((resolve) => {
    const start = Date.now();
    const tickMs = 16;

    renderable.opacity = from;
    renderer.requestLive();

    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / durationMs);
      renderable.opacity = from + (to - from) * t;

      if (t >= 1) {
        clearInterval(timer);
        renderer.dropLive();
        resolve();
      }
    }, tickMs);
  });

const setScreen = (next: ScreenId) => {
  if (currentScreen === next) return;

  if (currentScreen) {
    renderer.root.remove(screens[currentScreen].id ?? "");
  }

  renderer.root.add(screens[next]);
  currentScreen = next;
};

const transitionTo = async (next: ScreenId) => {
  if (currentScreen && currentScreen !== next) {
    await animateOpacity(screens[currentScreen], 1, 0, 300);
  }

  setScreen(next);
  await animateOpacity(screens[next], 0, 1, 300);
  if (next === "search") {
    searchInput.focus();
  }
};

setScreen("welcome");
await sleep(1500);
// await transitionTo("main");
await transitionTo("search");
