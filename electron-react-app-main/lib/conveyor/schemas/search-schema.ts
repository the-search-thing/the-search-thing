import { z } from 'zod'

export const searchIpcSchema = {
  'check': {
    args: z.tuple([z.string()]),
    return: z.boolean(),
  },
  'index': {
    args: z.tuple([z.string()]),
    return: z.boolean(),
  },
  'search': {
    args: z.tuple([z.string()]),
    return: z.object({
      results: z.array(z.string()),
    }),
  },
};
