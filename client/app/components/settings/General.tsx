import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useConveyor } from "@/app/hooks/use-conveyor";
import { useGeneralSettings } from "@/app/hooks/use-general-settings";
import type { GeneralSettingsState } from "@/lib/storage/general-settings";

type DraftGeneralSettings = Pick<
  GeneralSettingsState,
  "launch-on-startup" | "theme" | "font" | "scope" | "window-placement"
>;

export default function General() {
  const { settings, setAllSettings } = useGeneralSettings();
  const searchApi = useConveyor("search");
  const [draftSettings, setDraftSettings] = useState<DraftGeneralSettings>({
    "launch-on-startup": settings["launch-on-startup"],
    theme: settings.theme,
    font: settings.font,
    scope: settings.scope,
    "window-placement": settings["window-placement"],
  });
  const [status, setStatus] = useState<"idle" | "saved" | "cleared">("idle");
  const [clearIndexDialogOpen, setClearIndexDialogOpen] = useState(false);
  const clearIndexPending = false;

  useEffect(() => {
    setDraftSettings({
      "launch-on-startup": settings["launch-on-startup"],
      theme: settings.theme,
      font: settings.font,
      scope: settings.scope,
      "window-placement": settings["window-placement"],
    });
  }, [
    settings["launch-on-startup"],
    settings.theme,
    settings.font,
    settings.scope,
    settings["window-placement"],
  ]);

  useEffect(() => {
    if (status === "idle") return;

    const timeoutId = window.setTimeout(() => {
      setStatus("idle");
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [status]);

  useEffect(() => {
    if (!clearIndexDialogOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !clearIndexPending) {
        setClearIndexDialogOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearIndexDialogOpen, clearIndexPending]);

  useEffect(() => {
    // Only preview unsaved theme picks. Saved theme is owned by GlobalAppearancePreference.
    if (draftSettings.theme === settings.theme) return;

    const root = document.documentElement;
    const isDark = draftSettings.theme === "dark";
    root.classList.toggle("dark", isDark);
    root.classList.toggle("light", !isDark);

    return () => {
      const isDarkSetting = settings.theme === "dark";
      root.classList.toggle("dark", isDarkSetting);
      root.classList.toggle("light", !isDarkSetting);
    };
  }, [draftSettings.theme, settings.theme]);

  useEffect(() => {
    if (draftSettings.font === settings.font) return;

    document.body.dataset.font = draftSettings.font;

    return () => {
      document.body.dataset.font = settings.font;
    };
  }, [draftSettings.font, settings.font]);

  const hasUnsavedChanges = useMemo(() => {
    return (
      draftSettings["launch-on-startup"] !== settings["launch-on-startup"] ||
      draftSettings.theme !== settings.theme ||
      draftSettings.font !== settings.font ||
      draftSettings.scope !== settings.scope ||
      draftSettings["window-placement"] !== settings["window-placement"]
    );
  }, [draftSettings, settings]);

  const handleDiscard = () => {
    setDraftSettings({
      "launch-on-startup": settings["launch-on-startup"],
      theme: settings.theme,
      font: settings.font,
      scope: settings.scope,
      "window-placement": settings["window-placement"],
    });
  };

  const handleSave = () => {
    const nextSettings: GeneralSettingsState = {
      ...settings,
      ...draftSettings,
    };
    setStatus("saved");
    void setAllSettings(nextSettings);
  };

  const handleClearRecentSearches = async () => {
    try {
      await searchApi.pruneSearchHistory(0);
      setStatus("cleared");
    } catch (error) {
      console.error("Failed to clear recent searches:", error);
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full h-full bg-background text-foreground p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="text-xs uppercase tracking-wider text-foreground">General</div>
          {hasUnsavedChanges && (
            <div className="text-[11px] text-warning">Unsaved changes</div>
          )}
          {status === "saved" && <div className="text-[11px] text-success">Saved</div>}
          {status === "cleared" && <div className="text-[11px] text-success">Cleared</div>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDiscard}
            disabled={!hasUnsavedChanges}
            className={cn(
              "text-xs transition-colors px-2 py-1 rounded",
              hasUnsavedChanges
                ? "text-foreground bg-background hover:bg-accent hover:text-accent-foreground"
                : "text-foreground cursor-not-allowed",
            )}
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasUnsavedChanges}
            className={cn(
              "text-xs transition-colors px-2 py-1 rounded",
              hasUnsavedChanges
                ? "bg-accent text-accent-foreground"
                : "text-foreground cursor-not-allowed",
            )}
          >
            Save
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-foreground">Launch at startup</div>
            <div className="text-xs text-muted-foreground">Open the app when you sign in.</div>
          </div>
          <button
            type="button"
            onClick={() =>
              setDraftSettings((prev) => ({
                ...prev,
                "launch-on-startup": !prev["launch-on-startup"],
              }))
            }
            className={cn(
              "h-7 px-3 rounded-md text-xs transition-colors",
              draftSettings["launch-on-startup"]
                ? "bg-accent text-accent-foreground"
                : "bg-background text-foreground",
            )}
          >
            {draftSettings["launch-on-startup"] ? "On" : "Off"}
          </button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-foreground">Theme</div>
            <div className="text-xs text-muted-foreground">Ayu light or dark.</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDraftSettings((prev) => ({ ...prev, theme: "dark" }))}
              className={cn(
                "h-7 px-3 rounded-md text-xs transition-colors",
                draftSettings.theme === "dark"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent",
              )}
            >
              Dark
            </button>
            <button
              type="button"
              onClick={() => setDraftSettings((prev) => ({ ...prev, theme: "light" }))}
              className={cn(
                "h-7 px-3 rounded-md text-xs transition-colors",
                draftSettings.theme === "light"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent",
              )}
            >
              Light
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-foreground">Search scope</div>
            <div className="text-xs text-muted-foreground">Files, folders, or both.</div>
          </div>
          <select
            value={draftSettings.scope}
            onChange={(event) =>
              setDraftSettings((prev) => ({
                ...prev,
                scope: event.target.value as "both" | "files" | "folders",
              }))
            }
            className="h-7 rounded-md bg-background text-xs text-foreground px-2"
          >
            <option value="both">Everything</option>
            <option value="files">Files Only</option>
            <option value="folders">Folders Only</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-foreground">Clear recent searches</div>
            <div className="text-xs text-muted-foreground">Remove cached query history.</div>
          </div>
          <button
            type="button"
            onClick={() => void handleClearRecentSearches()}
            className="h-7 px-3 rounded-md text-xs text-foreground bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Clear
          </button>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-foreground">Clear Index</div>
            <div className="text-xs text-muted-foreground">
              Permanently removes all indexed files and embeddings. You will need to run a full
              re-index to search again.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setClearIndexDialogOpen(true)}
            className="h-7 px-3 rounded-md text-xs text-foreground bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {clearIndexDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-overlay"
            aria-label="Dismiss"
            onClick={() => !clearIndexPending && setClearIndexDialogOpen(false)}
          />
          <div
            className="relative z-10 w-full max-w-md rounded-lg bg-background p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-index-title"
          >
            <div id="clear-index-title" className="text-sm text-foreground">
              Clear the entire search index?
            </div>
            <div className="text-xs text-muted-foreground mt-2 leading-relaxed">
              This deletes every indexed asset and embedding in the database. The action cannot be
              undone. Search will stay empty until you index your folders again.
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={clearIndexPending}
                onClick={() => setClearIndexDialogOpen(false)}
                className="text-xs transition-colors px-2 py-1 rounded text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
