import { Context, Effect, Layer } from "effect";
import * as NodePath from "node:path";

export class SearchConfig extends Context.Service<
  SearchConfig,
  {
    readonly root: string;
    readonly extractCacheDir: string;
  }
>()("SearchConfig") {}

export type SearchConfigOptions = {
  readonly root: string;
  readonly extractCacheDir: string;
};

export const makeSearchConfigLayer = (options: SearchConfigOptions) =>
  Layer.succeed(SearchConfig)({
    root: NodePath.resolve(options.root),
    extractCacheDir: NodePath.resolve(options.extractCacheDir),
  });

export const SearchConfigLive = Layer.effect(SearchConfig)(
  Effect.gen(function* () {
    const root = process.env.SEARCH_ROOT;
    if (!root) {
      return yield* Effect.die(new Error("SEARCH_ROOT environment variable is required"));
    }

    const extractCacheDir =
      // there needs to be a better way to do this instead of cwd/.data/extracted
      process.env.EXTRACT_CACHE_DIR ?? NodePath.join(process.cwd(), ".data", "extracted");

    return {
      root: NodePath.resolve(root),
      extractCacheDir: NodePath.resolve(extractCacheDir),
    };
  }),
);
