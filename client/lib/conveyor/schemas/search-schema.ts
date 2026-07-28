import { z } from "zod";

const fileSearchItem = z.object({
  fileName: z.string(),
  relativePath: z.string(),
});

const contentSearchItem = z.object({
  relativePath: z.string(),
  lineNumber: z.number().int().positive(),
  lineContent: z.string(),
});

export const searchIpcSchema = {
  "search-root/get": {
    args: z.tuple([]),
    return: z.string().nullable(),
  },
  "search-root/set": {
    args: z.tuple([z.string()]),
    return: z.string(),
  },
  "file-search": {
    args: z.tuple([z.string(), z.number().int().positive()]),
    return: z.object({
      query: z.string(),
      items: z.array(fileSearchItem),
      totalMatched: z.number().int().nonnegative(),
    }),
  },
  "content-search": {
    args: z.tuple([z.string(), z.enum(["plain", "fuzzy", "regex"]), z.number().int().positive()]),
    return: z.object({
      query: z.string(),
      mode: z.enum(["plain", "fuzzy", "regex"]),
      items: z.array(contentSearchItem),
      totalMatched: z.number().int().nonnegative(),
    }),
  },
  "open-file-dialog": {
    args: z.tuple([]),
    return: z.string(),
  },
  "open-file": {
    args: z.tuple([z.string()]),
    return: z.null(),
  },
  "preview-file": {
    args: z.tuple([z.string()]),
    return: z.object({
      content: z.string(),
      truncated: z.boolean(),
    }),
  },
};
