import { app } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { existsSync } from "fs";
import { resolve, join, delimiter } from "path";
import { createInterface } from "readline";
import { config } from "dotenv";

const repoRoot = resolve(__dirname, "../../..");
config({ path: join(repoRoot, ".env") });

type JsonRpcId = number;

type JsonRpcResponse = {
  jsonrpc: string;
  id: JsonRpcId | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type SidecarLaunchSpec = {
  command: string;
  args: string[];
};

const SIDECAR_NAME =
  process.platform === "win32" ? "the-search-thing-sidecar.exe" : "the-search-thing-sidecar";
const FFMPEG_DIRNAME =
  process.platform === "win32" ? "win-x64" : process.platform === "linux" ? "linux-x64" : "";

class SidecarClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private nextId: JsonRpcId = 1;
  private pending = new Map<JsonRpcId, PendingRequest>();
  private started = false;

  private resolveRepoRoot() {
    return resolve(__dirname, "../../..");
  }

  private resolveBundledFfmpegDir() {
    if (!FFMPEG_DIRNAME) return null;

    const packagedDir = join(process.resourcesPath, "ffmpeg", FFMPEG_DIRNAME);
    if (app.isPackaged && existsSync(packagedDir)) {
      return packagedDir;
    }

    const repoRoot = this.resolveRepoRoot();
    const devDir = join(repoRoot, "client", "resources", "ffmpeg", FFMPEG_DIRNAME);
    if (existsSync(devDir)) {
      return devDir;
    }

    return null;
  }

  private resolveLaunchSpec(): SidecarLaunchSpec {
    if (app.isPackaged) {
      const packagedBinary = join(process.resourcesPath, "sidecar", SIDECAR_NAME);
      if (!existsSync(packagedBinary)) {
        throw new Error(`[sidecar] packaged binary not found at ${packagedBinary}`);
      }
      return { command: packagedBinary, args: [] };
    }

    const repoRoot = this.resolveRepoRoot();
    const debugPath = join(repoRoot, "target", "debug", SIDECAR_NAME);
    const releasePath = join(repoRoot, "target", "release", SIDECAR_NAME);
    const stagedPath = join(repoRoot, "client", "resources", "sidecar", SIDECAR_NAME);

    if (existsSync(debugPath)) return { command: debugPath, args: [] };
    if (existsSync(releasePath)) return { command: releasePath, args: [] };
    if (existsSync(stagedPath)) return { command: stagedPath, args: [] };

    return {
      command: "cargo",
      args: [
        "run",
        "--quiet",
        "--manifest-path",
        join(repoRoot, "Cargo.toml"),
        "--bin",
        "the-search-thing-sidecar",
      ],
    };
  }

  private failAllPending(error: Error) {
    for (const [id, request] of this.pending.entries()) {
      clearTimeout(request.timer);
      request.reject(error);
      this.pending.delete(id);
    }
  }

  private startProcess() {
    if (this.process) return;

    const launchSpec = this.resolveLaunchSpec();
    const bundledFfmpegDir = this.resolveBundledFfmpegDir();
    const env = { ...process.env };
    if (bundledFfmpegDir) {
      console.warn(`[ffmpeg] using bundled dir: ${bundledFfmpegDir}`);
      env.PATH = `${bundledFfmpegDir}${delimiter}${env.PATH ?? ""}`;
    } else if (process.platform === "win32" || process.platform === "linux") {
      console.warn("[ffmpeg] bundled dir not found; relying on PATH");
    }
    this.process = spawn(launchSpec.command, launchSpec.args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env,
    });

    const stdoutReader = createInterface({ input: this.process.stdout });
    stdoutReader.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let response: JsonRpcResponse;
      try {
        response = JSON.parse(trimmed) as JsonRpcResponse;
      } catch (error) {
        console.error("[sidecar] Invalid JSON response:", error);
        return;
      }

      if (typeof response.id !== "number") return;
      const pending = this.pending.get(response.id);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pending.delete(response.id);

      if (response.error) {
        pending.reject(
          new Error(
            `[sidecar:${response.error.code}] ${response.error.message}${
              response.error.data ? ` ${JSON.stringify(response.error.data)}` : ""
            }`,
          ),
        );
        return;
      }

      pending.resolve(response.result);
    });

    this.process.stderr.on("data", (chunk: Buffer) => {
      const message = chunk.toString().trim();
      if (message) {
        console.error("[sidecar:stderr]", message);
      }
    });

    this.process.on("error", (error) => {
      const hint =
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? " (run `npm --prefix client run sidecar:build:debug` or install Rust toolchain so cargo is available)"
          : "";
      this.failAllPending(new Error(`[sidecar] process error: ${error.message}${hint}`));
      this.process = null;
      this.started = false;
    });

    this.process.on("close", (code) => {
      this.failAllPending(new Error(`[sidecar] exited with code ${code ?? "unknown"}`));
      this.process = null;
      this.started = false;
    });
  }

  private ensureStarted() {
    if (this.started && this.process && !this.process.killed) {
      return;
    }

    this.startProcess();
    this.started = true;
  }

  async call<T>(method: string, params?: Record<string, unknown>, timeoutMs = 20_000): Promise<T> {
    this.ensureStarted();
    if (!this.process) {
      throw new Error("sidecar process is not available");
    }

    const id = this.nextId++;
    const payload: Record<string, unknown> = {
      jsonrpc: "2.0",
      id,
      method,
    };

    if (params !== undefined) {
      payload.params = params;
    }

    const request = `${JSON.stringify(payload)}\n`;

    return new Promise<T>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`[sidecar] timeout after ${timeoutMs}ms for method ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => resolvePromise(value as T),
        reject: rejectPromise,
        timer,
      });

      this.process?.stdin.write(request, (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(new Error(`[sidecar] failed to send request: ${error.message}`));
      });
    });
  }

  async ping() {
    return this.call<{
      ok: boolean;
      service: string;
      version: string;
      backend_url?: string;
      index_mode?: string;
      search_mode?: string;
    }>("health.ping");
  }

  async searchQuery(query: string) {
    return this.call<{
      results: Array<{
        label: string;
        content?: string | null;
        path: string;
        thumbnail_url?: string | null;
      }>;
    }>("search.query", {
      q: query,
    });
  }

  async walkTextBatch(params: {
    dir: string;
    textExts: string[];
    ignoreExts: string[];
    ignoreFiles: string[];
    cursor: number;
    batchSize: number;
  }) {
    return this.call<{
      batch: [string, string][];
      cursor: number;
      done: boolean;
      scannedCount: number;
      skippedCount: number;
    }>("fs.walkTextBatch", params);
  }

  async indexStart(dir: string, batchSize = 200) {
    return this.call<{ success: boolean; job_id: string }>("index.start", {
      dir,
      batch_size: batchSize,
    });
  }

  async clearIndex() {
    return this.call<{ ok: boolean }>("index.clear", {});
  }

  async indexStatus(jobId: string) {
    return this.call<{
      job_id: string;
      dir: string;
      status: string;
      phase: string;
      batch_size: number;
      text_found: number;
      text_indexed: number;
      text_errors: number;
      text_skipped: number;
      video_found: number;
      video_indexed: number;
      video_errors: number;
      video_skipped: number;
      image_found: number;
      image_indexed: number;
      image_errors: number;
      image_skipped: number;
      message: string;
      error: string;
      started_at: string;
      updated_at: string;
      finished_at: string | null;
    }>("index.status", {
      job_id: jobId,
    });
  }

  stop() {
    if (!this.process) return;
    this.process.kill();
    this.process = null;
    this.started = false;
  }
}

export const sidecarClient = new SidecarClient();
