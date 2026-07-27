import { resolve } from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

// Shared alias configuration
const aliases = {
  "@/app": resolve(__dirname, "app"),
  "@/lib": resolve(__dirname, "lib"),
  "@/resources": resolve(__dirname, "resources"),
};

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, "lib/main/main.ts"),
        },
        // Native napi packages must stay external. Bundling them turns optional
        // platform requires into top-level loads of both gnu and musl .node files.
        external: ["ffi-rs", /^@yuuang\/ffi-rs-/, /^@ff-labs\/fff-bin-/],
      },
    },
    resolve: {
      alias: aliases,
    },
    plugins: [
      externalizeDepsPlugin({
        // Bundle TS workspace packages, but keep fff-node external because it is
        // ESM-only and performs runtime native binary resolution.
        exclude: ["@the-search-thing/api", "@the-search-thing/backend"],
        // Keep ffi-rs external so napi platform detection is not flattened into
        // top-level .node requires during bundling.
        include: ["ffi-rs"],
      }),
    ],
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          preload: resolve(__dirname, "lib/preload/preload.ts"),
        },
      },
    },
    resolve: {
      alias: aliases,
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: "./app",
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "app/index.html"),
        },
      },
    },
    resolve: {
      alias: aliases,
    },
    plugins: [tailwindcss(), react()],
  },
});
