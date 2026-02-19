import { z } from 'zod'

const searchHistoryEntry = z.object({
  id: z.number(),
  search_string: z.string(),
  timestamp: z.number(),
  file_types: z.array(z.string()).nullable(),
  filters: z.record(z.unknown()).nullable(),
  path_scope: z.string().nullable(),
})

export const searchHistoryIpcSchema = {
  'search-history/add': {
    args: z.tuple([
      z.object({
        search_string: z.string(),
        timestamp: z.number().optional(),
        file_types: z.array(z.string()).optional(),
        filters: z.record(z.unknown()).optional(),
        path_scope: z.string().optional(),
      }),
    ]),
    return: z.object({ id: z.number() }),
  },
  'search-history/recent': {
    args: z.tuple([z.number()]),
    return: z.array(searchHistoryEntry),
  },
  'search-history/prune': {
    args: z.tuple([z.number()]),
    return: z.object({ deleted: z.number() }),
  },
} as const
