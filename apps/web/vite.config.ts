import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  server: {
    proxy: {
      "/healthz": "http://localhost:3000",
      "/search": "http://localhost:3000",
    },
  },
});
