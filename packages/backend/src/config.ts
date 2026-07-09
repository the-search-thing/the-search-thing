import { Context, Effect, Layer } from "effect"

export class SearchConfig extends Context.Service<SearchConfig, {
  readonly root: string
}>()("SearchConfig") {}

export const SearchConfigLive = Layer.effect(SearchConfig)(
  Effect.gen(function* () {
    const root = process.env.SEARCH_ROOT
    if (!root) {
      return yield* Effect.die(new Error("SEARCH_ROOT environment variable is required"))
    }
    return { root }
  }),
)
