import { FileFinder, type Result } from "@ff-labs/fff-node";
import * as NodeFs from "node:fs/promises";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

/**
 * Profiles contentSearch's dual-grep path against a single root fff grep.
 *
 * contentSearch greps SEARCH_ROOT, greps EXTRACT_CACHE_DIR, remaps extract hits
 * back to source paths, then concatenates. This test times those pieces on a
 * synthetic corpus and writes the numbers to grep-profile.md next to this file.
 */

const ROOT_FILE_COUNT = 400;
const EXTRACT_FILE_COUNT = 400;
const LINES_PER_FILE = 40;
const QUERY = "NEEDLE_TOKEN_ZZ";
const LIMIT = 50;
const WARMUP_ITERS = 3;
const SAMPLE_ITERS = 15;

type GrepPage = {
  items: ReadonlyArray<{
    relativePath: string;
    lineNumber: number;
    lineContent: string;
  }>;
  totalMatched: number;
};

const unwrap = <A>(result: Result<A>): A => {
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const createFinder = async (basePath: string): Promise<FileFinder> => {
  const created = FileFinder.create({ basePath, aiMode: true });
  if (!created.ok) throw new Error(created.error);
  const finder = created.value;
  const ready = await finder.waitForScan(10_000);
  if (!ready.ok) {
    finder.destroy();
    throw new Error(ready.error);
  }
  if (!ready.value) {
    finder.destroy();
    throw new Error(`Initial file scan timed out for ${basePath}`);
  }
  return finder;
};

const grep = (finder: FileFinder, query: string, limit: number): GrepPage => {
  const result = unwrap(
    finder.grep(query, {
      mode: "plain",
      pageSize: limit,
    }),
  );
  return {
    items: result.items.map((item) => ({
      relativePath: item.relativePath,
      lineNumber: item.lineNumber,
      lineContent: item.lineContent,
    })),
    totalMatched: result.totalMatched,
  };
};

const originalRelativePath = (cacheRelativePath: string): string | undefined => {
  const normalized = cacheRelativePath.replaceAll("\\", "/");
  if (!normalized.endsWith(".txt")) return undefined;
  return normalized.slice(0, -".txt".length);
};

const consolidate = (native: GrepPage, extracted: GrepPage, limit: number): GrepPage => {
  const remapped = extracted.items.flatMap((item) => {
    const original = originalRelativePath(item.relativePath);
    if (!original) return [];
    return [
      {
        relativePath: original,
        lineNumber: item.lineNumber,
        lineContent: item.lineContent,
      },
    ];
  });
  return {
    items: [...native.items, ...remapped].slice(0, limit),
    totalMatched: native.totalMatched + extracted.totalMatched,
  };
};

const median = (samples: ReadonlyArray<number>): number => {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  return value;
};

const mean = (samples: ReadonlyArray<number>): number =>
  samples.reduce((sum, n) => sum + n, 0) / samples.length;

const fmtMs = (ms: number): string => `${ms.toFixed(2)}ms`;

const writeCorpus = async (rootDir: string, extractDir: string): Promise<void> => {
  await NodeFs.mkdir(NodePath.join(rootDir, "src"), { recursive: true });
  await NodeFs.mkdir(NodePath.join(extractDir, "docs"), { recursive: true });

  for (let i = 0; i < ROOT_FILE_COUNT; i++) {
    const hit = i % 17 === 0;
    const lines = Array.from({ length: LINES_PER_FILE }, (_, line) =>
      hit && line === 3
        ? `root line ${line} ${QUERY} file=${i}`
        : `root line ${line} filler_${i}_${line}`,
    );
    await NodeFs.writeFile(NodePath.join(rootDir, "src", `file-${i}.ts`), `${lines.join("\n")}\n`);
  }

  for (let i = 0; i < EXTRACT_FILE_COUNT; i++) {
    const hit = i % 19 === 0;
    const lines = Array.from({ length: LINES_PER_FILE }, (_, line) =>
      hit && line === 5
        ? `extract line ${line} ${QUERY} doc=${i}`
        : `extract line ${line} filler_${i}_${line}`,
    );
    // Mirror extract-cache layout: original.pdf → original.pdf.txt
    await NodeFs.writeFile(
      NodePath.join(extractDir, "docs", `doc-${i}.pdf.txt`),
      `${lines.join("\n")}\n`,
    );
  }
};

describe("contentSearch grep profile", () => {
  it("times root-only grep vs dual grep + remap and writes grep-profile.md", async () => {
    const base = await NodeFs.mkdtemp(NodePath.join(NodeOs.tmpdir(), "tst-grep-profile-"));
    const rootDir = NodePath.join(base, "root");
    const extractDir = NodePath.join(base, "extract");

    let rootFinder: FileFinder | undefined;
    let extractFinder: FileFinder | undefined;

    try {
      await writeCorpus(rootDir, extractDir);
      rootFinder = await createFinder(rootDir);
      extractFinder = await createFinder(extractDir);

      const rootOnly = (): GrepPage => grep(rootFinder!, QUERY, LIMIT);
      const extractOnly = (): GrepPage => grep(extractFinder!, QUERY, LIMIT);
      const dual = (): GrepPage => {
        const native = grep(rootFinder!, QUERY, LIMIT);
        const extracted = grep(extractFinder!, QUERY, LIMIT);
        return consolidate(native, extracted, LIMIT);
      };

      // Correctness smoke: dual sees both corpora.
      const sample = dual();
      expect(sample.totalMatched).toBeGreaterThan(0);
      expect(sample.items.some((item) => item.relativePath.startsWith("src/"))).toBe(true);
      expect(sample.items.some((item) => item.relativePath.startsWith("docs/"))).toBe(true);

      for (let i = 0; i < WARMUP_ITERS; i++) {
        rootOnly();
        extractOnly();
        dual();
      }

      const time = (fn: () => void): number => {
        const start = performance.now();
        fn();
        return performance.now() - start;
      };

      const rootSamples: number[] = [];
      const extractSamples: number[] = [];
      const dualSamples: number[] = [];
      const remapOnlySamples: number[] = [];

      for (let i = 0; i < SAMPLE_ITERS; i++) {
        rootSamples.push(time(rootOnly));
        extractSamples.push(time(extractOnly));

        const native = grep(rootFinder, QUERY, LIMIT);
        const extracted = grep(extractFinder, QUERY, LIMIT);
        const remapStart = performance.now();
        consolidate(native, extracted, LIMIT);
        remapOnlySamples.push(performance.now() - remapStart);

        dualSamples.push(time(dual));
      }

      const rootMed = median(rootSamples);
      const extractMed = median(extractSamples);
      const dualMed = median(dualSamples);
      const remapMed = median(remapOnlySamples);
      const ratio = dualMed / rootMed;

      const outPath = NodePath.join(import.meta.dirname, "grep-profile.md");
      const body = `# contentSearch grep profile

Generated by \`grep-profile.test.ts\` on ${new Date().toISOString()}.

## What this measures

\`contentSearch\` runs two fff greps then consolidates:

1. plain grep on \`SEARCH_ROOT\` (native / greppable files)
2. plain grep on \`EXTRACT_CACHE_DIR\` (LiteParse \`.txt\` mirrors)
3. remap extract paths (\`foo.pdf.txt\` → \`foo.pdf\`) and concatenate

This is **not** comparing against \`fileSearch\` (name/path). Baseline is a single root fff grep on the same corpus.

## Fixture

| | |
|---|---|
| Root files | ${ROOT_FILE_COUNT} (\`src/file-*.ts\`, ${LINES_PER_FILE} lines each) |
| Extract files | ${EXTRACT_FILE_COUNT} (\`docs/doc-*.pdf.txt\`, ${LINES_PER_FILE} lines each) |
| Query | \`${QUERY}\` (plain mode) |
| Limit | ${LIMIT} |
| Warmup / samples | ${WARMUP_ITERS} / ${SAMPLE_ITERS} |
| Host | ${NodeOs.hostname()} / ${NodeOs.type()} ${NodeOs.release()} / ${NodeOs.cpus()[0]?.model ?? "unknown cpu"} |

## Results (median of ${SAMPLE_ITERS})

| Path | Median | Mean |
|---|---:|---:|
| Root grep only (baseline) | ${fmtMs(rootMed)} | ${fmtMs(mean(rootSamples))} |
| Extract grep only | ${fmtMs(extractMed)} | ${fmtMs(mean(extractSamples))} |
| Remap + concat only | ${fmtMs(remapMed)} | ${fmtMs(mean(remapOnlySamples))} |
| Dual grep + remap (\`contentSearch\`) | ${fmtMs(dualMed)} | ${fmtMs(mean(dualSamples))} |

**Dual / root ratio:** ${ratio.toFixed(2)}×

Raw samples (ms):

- root: ${rootSamples.map((n) => n.toFixed(2)).join(", ")}
- extract: ${extractSamples.map((n) => n.toFixed(2)).join(", ")}
- dual: ${dualSamples.map((n) => n.toFixed(2)).join(", ")}
- remap: ${remapOnlySamples.map((n) => n.toFixed(2)).join(", ")}

## Read

Remap is noise next to grep. Dual should land near root + extract when both corpora are similar size; the ratio moves with extract corpus size relative to root.
`;

      await NodeFs.writeFile(outPath, body, "utf8");

      // Soft structural checks — absolute ms varies by machine.
      expect(dualMed).toBeGreaterThan(0);
      expect(rootMed).toBeGreaterThan(0);
      // Dual includes root work, so it should not be dramatically faster than root alone.
      expect(ratio).toBeGreaterThan(0.8);
      // With equal-sized corpora, dual should be clearly above a single root grep.
      expect(ratio).toBeGreaterThan(1.2);
      // Remap should be tiny vs greps on this fixture.
      expect(remapMed).toBeLessThan(rootMed);
    } finally {
      rootFinder?.destroy();
      extractFinder?.destroy();
      await NodeFs.rm(base, { recursive: true, force: true });
    }
  });
});
