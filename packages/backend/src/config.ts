import { Context, Effect, Layer } from "effect";
import * as NodePath from "node:path";

export class SearchConfig extends Context.Service<
  SearchConfig,
  {
    readonly root: string;
    readonly extractCacheDir: string;
  }
>()("SearchConfig") {}

export const SearchConfigLive = Layer.effect(SearchConfig)(
  Effect.gen(function* () {
    const root = process.env.SEARCH_ROOT;
    if (!root) {
      return yield* Effect.die(new Error("SEARCH_ROOT environment variable is required"));
    }

    const extractCacheDir =
      process.env.EXTRACT_CACHE_DIR ?? NodePath.join(process.cwd(), ".data", "extracted");

    return {
      root: NodePath.resolve(root),
      extractCacheDir: NodePath.resolve(extractCacheDir),
    };
  }),
);
