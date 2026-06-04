const { spawnSync } = require("child_process");
const { mkdirSync, copyFileSync, existsSync } = require("fs");
const { join, resolve } = require("path");

const repoRoot = resolve(__dirname, "..", "..");
const clientRoot = resolve(__dirname, "..");
const sidecarName =
  process.platform === "win32" ? "the-search-thing-sidecar.exe" : "the-search-thing-sidecar";

const build = spawnSync(
  "cargo",
  [
    "build",
    "--manifest-path",
    join(repoRoot, "Cargo.toml"),
    "--bin",
    "the-search-thing-sidecar",
    "--release",
  ],
  {
    stdio: "inherit",
  },
);

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const source = join(repoRoot, "target", "release", sidecarName);
const destinationDir = join(clientRoot, "resources", "sidecar");
const destination = join(destinationDir, sidecarName);

if (!existsSync(source)) {
  console.error(`[sidecar] build finished but binary missing: ${source}`);
  process.exit(1);
}

mkdirSync(destinationDir, { recursive: true });
copyFileSync(source, destination);

console.log(`[sidecar] staged ${destination}`);
