import { NodeChildProcessSpawner, NodeFileSystem, NodePath } from "@effect/platform-node";
import { LiteParse } from "@llamaindex/liteparse";
import { Effect, Layer } from "effect";
import * as NodePathMod from "node:path";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { DocumentExtractError, DocumentExtractService } from "./DocumentExtractService.js";

const pdfExtensions = new Set([".pdf"]);

/**
 * Formats that need LiteParse (+ LibreOffice for Office) because the root fff
 * finder either skips them as binary or only sees markup/container bytes — not
 * the document's readable text.
 *
 * Deliberately excluded: `.csv` / `.tsv`. Those are plain text; root fff greps
 * the full file content with correct line numbers. Extracting them would
 * duplicate hits in `contentSearch` (same path after `.txt` remap) without
 * adding coverage. Keep extracting `.rtf`: raw RTF is greppable as bytes but
 * is control-word soup; LibreParse recovers the actual prose.
 */
const officeExtensions = new Set([
  ".doc",
  ".docx",
  ".docm",
  ".odt",
  ".rtf",
  ".ppt",
  ".pptx",
  ".pptm",
  ".odp",
  ".xls",
  ".xlsx",
  ".xlsm",
  ".ods",
]);

const extensionOf = (path: string): string => NodePathMod.extname(path).toLowerCase();

const contentTypeFor = (ext: string): string => {
  if (pdfExtensions.has(ext)) return "application/pdf";
  if (ext === ".docx" || ext === ".doc") return "application/msword";
  if (ext.startsWith(".ppt")) return "application/vnd.ms-powerpoint";
  if (ext.startsWith(".xls") || ext === ".ods") {
    return "application/vnd.ms-excel";
  }
  return "application/octet-stream";
};

const probeLibreOffice = Effect.scoped(
  Effect.gen(function* () {
    for (const binary of ["soffice", "libreoffice"] as const) {
      const available = yield* Effect.gen(function* () {
        const handle = yield* ChildProcess.make(binary, ["--version"]);
        const code = yield* handle.exitCode;
        return code === ChildProcessSpawner.ExitCode(0);
      }).pipe(Effect.orElseSucceed(() => false));

      if (available) return true;
    }
    return false;
  }),
);

const processLayer = NodeChildProcessSpawner.layer.pipe(
  Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
);

export const DocumentExtractLive = Layer.effect(DocumentExtractService)(
  Effect.gen(function* () {
    const libreOfficeAvailable = yield* probeLibreOffice;

    const parser = new LiteParse({
      ocrEnabled: false,
      outputFormat: "text",
      quiet: true,
    });

    return {
      libreOfficeAvailable,

      supports: (path) => {
        const ext = extensionOf(path);
        if (pdfExtensions.has(ext)) return true;
        if (officeExtensions.has(ext)) return libreOfficeAvailable;
        return false;
      },

      extract: (path) =>
        Effect.gen(function* () {
          const ext = extensionOf(path);
          if (officeExtensions.has(ext) && !libreOfficeAvailable) {
            return yield* DocumentExtractError.make({
              path,
              message:
                "LibreOffice (soffice) is required to extract Office documents; To install it visit: https://www.libreoffice.org/download/",
            });
          }
          if (!pdfExtensions.has(ext) && !officeExtensions.has(ext)) {
            return yield* DocumentExtractError.make({
              path,
              message: `Unsupported document type: ${ext || "(none)"}`,
            });
          }

          const result = yield* Effect.tryPromise({
            try: () => parser.parse(path),
            catch: (error) =>
              DocumentExtractError.make({
                path,
                message: error instanceof Error ? error.message : String(error),
              }),
          });

          const text = result.text.split("\0").join("").trimEnd();
          if (text.length === 0) {
            return yield* DocumentExtractError.make({
              path,
              message: "Document produced empty text",
            });
          }

          return {
            text: `${text}\n`,
            contentType: contentTypeFor(ext),
          };
        }),
    };
  }),
).pipe(Layer.provide(processLayer));
