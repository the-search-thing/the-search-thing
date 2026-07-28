import {
  FileSearchBasicLayer,
  FileSearchService,
  makeSearchConfigLayer,
} from "@the-search-thing/backend/search";
import { Effect, Layer, ManagedRuntime } from "effect";
import { open, stat } from "node:fs/promises";
import * as NodePath from "node:path";

const PREVIEW_BYTES_MAX = 64 * 1024;

const fileSearch = Effect.fn("EmbeddedSearch.fileSearch")(function* (input: {
  readonly query: string;
  readonly limit: number;
}) {
  const search = yield* FileSearchService;
  return yield* search.fileSearch(input);
});

const contentSearch = Effect.fn("EmbeddedSearch.contentSearch")(function* (input: {
  readonly query: string;
  readonly mode: "plain" | "fuzzy" | "regex";
  readonly limit: number;
}) {
  const search = yield* FileSearchService;
  return yield* search.contentSearch(input);
});

const makeRuntime = (root: string, extractCacheDir: string) => {
  const configLayer = makeSearchConfigLayer({ root, extractCacheDir });
  const searchLayer = FileSearchBasicLayer.pipe(Layer.provide(configLayer));
  return ManagedRuntime.make(searchLayer);
};

type Runtime = ReturnType<typeof makeRuntime>;
type RuntimeState = {
  readonly root: string;
  readonly runtime: Runtime;
};

export class SearchRuntime {
  private state: RuntimeState | undefined;
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly extractCacheDir: string) {}

  getRoot = (): string | null => this.state?.root ?? null;

  setRoot = (root: string): Promise<string> =>
    this.enqueue(async () => {
      const normalizedRoot = NodePath.resolve(root);
      const rootStat = await stat(normalizedRoot);
      if (!rootStat.isDirectory()) {
        throw new Error(`Search root is not a directory: ${normalizedRoot}`);
      }
      if (this.state?.root === normalizedRoot) {
        return normalizedRoot;
      }

      const runtime = makeRuntime(normalizedRoot, this.extractCacheDir);
      try {
        await runtime.context();
      } catch (error) {
        await runtime.dispose();
        throw error;
      }

      const previous = this.state;
      this.state = { root: normalizedRoot, runtime };
      await previous?.runtime.dispose();
      return normalizedRoot;
    });

  searchFiles = (query: string, limit: number) =>
    this.enqueue(async () => {
      const state = this.requireState();
      return state.runtime.runPromise(fileSearch({ query, limit }));
    });

  searchContent = (query: string, mode: "plain" | "fuzzy" | "regex", limit: number) =>
    this.enqueue(async () => {
      const state = this.requireState();
      return state.runtime.runPromise(contentSearch({ query, mode, limit }));
    });

  resolveResultPath = (relativePath: string): Promise<string> =>
    this.enqueue(async () => this.resolvePathUnderRoot(relativePath));

  previewFile = (relativePath: string): Promise<{ content: string; truncated: boolean }> =>
    this.enqueue(async () => {
      const absolutePath = this.resolvePathUnderRoot(relativePath);
      const file = await open(absolutePath, "r");
      try {
        const { size } = await file.stat();
        const toRead = Math.min(size, PREVIEW_BYTES_MAX);
        const buffer = Buffer.alloc(toRead);
        const { bytesRead } = await file.read(buffer, 0, toRead, 0);
        const slice = buffer.subarray(0, bytesRead);
        if (slice.includes(0)) {
          return { content: "(Binary file — open to view contents.)", truncated: false };
        }
        return {
          content: slice.toString("utf8"),
          truncated: size > bytesRead,
        };
      } finally {
        await file.close();
      }
    });

  dispose = (): Promise<void> =>
    this.enqueue(async () => {
      const previous = this.state;
      this.state = undefined;
      await previous?.runtime.dispose();
    });

  private requireState = (): RuntimeState => {
    if (!this.state) {
      throw new Error("Choose a search folder before searching");
    }
    return this.state;
  };

  private resolvePathUnderRoot = (relativePath: string): string => {
    const { root } = this.requireState();
    const absolutePath = NodePath.resolve(root, relativePath);
    const pathFromRoot = NodePath.relative(root, absolutePath);
    const outsideRoot =
      pathFromRoot === ".." ||
      pathFromRoot.startsWith(`..${NodePath.sep}`) ||
      NodePath.isAbsolute(pathFromRoot);
    if (outsideRoot) {
      throw new Error("Refusing to open a path outside the search root");
    }
    return absolutePath;
  };

  private enqueue = <A>(operation: () => Promise<A>): Promise<A> => {
    const result = this.pending.then(operation, operation);
    this.pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
