import { z } from 'zod'

export const searchIpcSchema = {
  // check: {
  //   args: z.tuple([]),
  //   return: z.object({ success: z.boolean() }),
  // },
  index: {
    args: z.tuple([z.string()]),
    return: z.object({ success: z.boolean(), job_id: z.string() }),
  },
  search: {
    args: z.tuple([z.string()]),
    return: z.object({
      results: z.array(
        z.object({
          label: z.string(),
          content: z.string().nullable().optional(),
          path: z.string(),
        })
      ),
    }),
  },
  // system operations
  'open-file-dialog': {
    args: z.tuple([]),
    return: z.string(),
  },
  'open-file': {
    args: z.tuple([z.string()]),
    result: z.null(),
  },
}
