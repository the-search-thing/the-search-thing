import { app, protocol, net } from "electron";
import { existsSync, readFileSync, statSync } from "fs";
import { extname, join, resolve } from "path";
import { pathToFileURL } from "url";

type FileTypesConfig = {
  image?: string[];
};

function getConfigPath(): string {
  // In packaged builds, config is bundled to resources/config/
  // In dev, it's at project root (3 levels up from lib/main/)
  return app.isPackaged
    ? resolve(process.resourcesPath, "config/file_types.json")
    : resolve(__dirname, "../../../config/file_types.json");
}

function loadAllowedImageExtensions() {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    console.error(`file_types.json not found at: ${configPath}`);
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as FileTypesConfig;
    const imageExtensions = parsed.image ?? [];
    const normalized = imageExtensions
      .filter((extension) => typeof extension === "string" && extension.startsWith("."))
      .map((extension) => extension.toLowerCase());

    if (normalized.length === 0) {
      console.error(
        "file_types.json image extension list is empty or invalid for localimg protocol",
      );
      return null;
    }

    return new Set(normalized);
  } catch (error) {
    console.error("Failed to parse file_types.json for localimg protocol:", error);
    return null;
  }
}

const ALLOWED_IMAGE_EXTENSIONS = loadAllowedImageExtensions();

export function registerResourcesProtocol() {
  protocol.handle("res", async (request) => {
    try {
      const url = new URL(request.url);
      // Combine hostname and pathname to get the full path
      const fullPath = join(url.hostname, url.pathname.slice(1));
      const filePath = join(__dirname, "../../resources", fullPath);
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (error) {
      console.error("Protocol error:", error);
      return new Response("Resource not found", { status: 404 });
    }
  });

  protocol.handle("localimg", async (request) => {
    try {
      const url = new URL(request.url);
      const rawPath = url.searchParams.get("path");
      if (!rawPath) {
        return new Response("Missing image path", { status: 400 });
      }

      if (!ALLOWED_IMAGE_EXTENSIONS) {
        return new Response(
          "Image type configuration unavailable. file not found in config/file_types.json",
          { status: 503 },
        );
      }

      const decodedPath = rawPath;
      const extension = extname(decodedPath).toLowerCase();
      if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
        return new Response("Unsupported image type", { status: 400 });
      }

      if (!existsSync(decodedPath)) {
        return new Response("Image not found", { status: 404 });
      }

      const stats = statSync(decodedPath);
      if (!stats.isFile()) {
        return new Response("Invalid image path", { status: 400 });
      }

      // Delegate content-type detection to Chromium via file:// fetch.
      return net.fetch(pathToFileURL(decodedPath).toString());
    } catch (error) {
      console.error("Local image protocol error:", error);
      return new Response("Image preview unavailable", { status: 404 });
    }
  });
}
