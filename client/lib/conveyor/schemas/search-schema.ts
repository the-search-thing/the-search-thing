import { z } from "zod";

export const searchIpcSchema = {
  index: {
    args: z.tuple([z.string()]),
    return: z.object({ success: z.boolean(), job_id: z.string() }),
  },
  "clear-index": {
    args: z.tuple([]),
    return: z.object({ ok: z.boolean() }),
  },
  "index-status": {
    args: z.tuple([z.string()]),
    return: z.object({
      job_id: z.string(),
      dir: z.string(),
      status: z.string(),
      phase: z.string(),
      batch_size: z.number(),
      text_found: z.number(),
      text_indexed: z.number(),
      text_errors: z.number(),
      text_skipped: z.number(),
      video_found: z.number(),
      video_indexed: z.number(),
      video_errors: z.number(),
      video_skipped: z.number(),
      image_found: z.number(),
      image_indexed: z.number(),
      image_errors: z.number(),
      image_skipped: z.number(),
      message: z.string(),
      error: z.string(),
      started_at: z.string(),
      updated_at: z.string(),
      finished_at: z.string().nullable(),
    }),
  },
  search: {
    args: z.tuple([z.string()]),
    return: z.object({
      results: z.array(
        z.object({
          label: z.string(),
          content: z.string().nullable().optional(),
          path: z.string(),
          thumbnail_url: z.string().nullable().optional(),
        }),
      ),
    }),
  },
  "sidecar-ping": {
    args: z.tuple([]),
    return: z.object({
      ok: z.boolean(),
      service: z.string(),
      version: z.string(),
      backend_url: z.string().optional(),
      index_mode: z.string().optional(),
      search_mode: z.string().optional(),
    }),
  },
  "sidecar-walk-text-batch": {
    args: z.tuple([
      z.object({
        dir: z.string(),
        textExts: z.array(z.string()),
        ignoreExts: z.array(z.string()),
        ignoreFiles: z.array(z.string()),
        cursor: z.number().int().nonnegative(),
        batchSize: z.number().int().positive(),
      }),
    ]),
    return: z.object({
      batch: z.array(z.tuple([z.string(), z.string()])),
      cursor: z.number().int().nonnegative(),
      done: z.boolean(),
      scannedCount: z.number().int().nonnegative(),
      skippedCount: z.number().int().nonnegative(),
    }),
  },
  // system operations
  "open-file-dialog": {
    args: z.tuple([]),
    return: z.array(z.string()),
  },
  "open-file": {
    args: z.tuple([z.string()]),
    return: z.null(),
  },
};
