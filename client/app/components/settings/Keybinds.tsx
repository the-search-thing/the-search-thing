import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useKeybinds } from "@/app/hooks/use-keybinds";
import {
  type KeybindAction,
  type KeyCombo,
  KEYBIND_ACTIONS,
  DEFAULT_KEYBINDS,
  comboFromEvent,
  comboTokens,
  combosEqual,
  findConflict,
  formatCombo,
} from "@/lib/storage/keybind-store";

function KeyToken({ children }: { children: string }) {
  return <kbd className="px-2 py-1 text-xs text-foreground bg-secondary rounded">{children}</kbd>;
}

function ComboDisplay({ combo }: { combo: KeyCombo }) {
  const tokens = comboTokens(combo);
  return (
    <div className="flex items-center gap-2">
      {tokens.map((token, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-xs text-muted-foreground">+</span>}
          <KeyToken>{token}</KeyToken>
        </span>
      ))}
    </div>
  );
}

type KeybindRowProps = {
  action: KeybindAction;
  label: string;
  description: string;
  combo: KeyCombo;
  isRecording: boolean;
  onStartRecording: () => void;
  onCancelRecording: () => void;
  onRecorded: (combo: KeyCombo) => void;
  conflict: string | null;
};

function KeybindRow({
  label,
  description,
  combo,
  isRecording,
  onStartRecording,
  onCancelRecording,
  onRecorded,
  conflict,
}: KeybindRowProps) {
  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        onCancelRecording();
        return;
      }

      const newCombo = comboFromEvent(e);
      if (newCombo) {
        onRecorded(newCombo);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isRecording, onCancelRecording, onRecorded]);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-3 py-2 rounded-md transition-colors",
        isRecording && "bg-warning-muted ring-1 ring-warning",
        conflict && "bg-destructive/10 ring-1 ring-destructive/40",
      )}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="text-sm text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
        {conflict && (
          <div className="text-xs text-destructive mt-0.5">Conflicts with: {conflict}</div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {isRecording ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-warning animate-pulse">Press keys...</span>
            <button
              type="button"
              onClick={onCancelRecording}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-accent"
            >
              Esc
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartRecording}
            className={cn(
              "flex items-center gap-2 group cursor-pointer",
              "rounded-md px-2 py-1 -mx-2 -my-1",
              "hover:bg-accent transition-colors",
            )}
            title="Click to rebind"
          >
            <ComboDisplay combo={combo} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function Keybinds() {
  const { keybinds, setAllKeybinds } = useKeybinds();
  const [recordingAction, setRecordingAction] = useState<KeybindAction | null>(null);
  const [draftKeybinds, setDraftKeybinds] = useState(() => ({ ...keybinds }));
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);

  useEffect(() => {
    setDraftKeybinds({ ...keybinds });
  }, [keybinds]);

  useEffect(() => {
    const isRecording = recordingAction !== null;
    if (isRecording) {
      document.body.dataset.keybindRecording = "true";
    } else {
      delete document.body.dataset.keybindRecording;
    }

    return () => {
      delete document.body.dataset.keybindRecording;
    };
  }, [recordingAction]);

  const handleStartRecording = (action: KeybindAction) => {
    setRecordingAction(action);
  };

  const handleCancelRecording = () => {
    setRecordingAction(null);
  };

  const handleRecorded = (action: KeybindAction, combo: KeyCombo) => {
    setDraftKeybinds((prev) => ({ ...prev, [action]: combo }));
    setRecordingAction(null);
  };

  const hasCustomBindings = KEYBIND_ACTIONS.some(
    ({ action }) => !combosEqual(draftKeybinds[action], DEFAULT_KEYBINDS[action]),
  );

  const hasUnsavedChanges = useMemo(() => {
    return KEYBIND_ACTIONS.some(
      ({ action }) => !combosEqual(draftKeybinds[action], keybinds[action]),
    );
  }, [draftKeybinds, keybinds]);

  const conflictMap = useMemo(() => {
    const map = new Map<KeybindAction, string>();
    for (const { action } of KEYBIND_ACTIONS) {
      const conflictAction = findConflict(draftKeybinds[action], draftKeybinds, action);
      if (conflictAction) {
        const meta = KEYBIND_ACTIONS.find((m) => m.action === conflictAction);
        map.set(action, meta?.label ?? conflictAction);
      }
    }
    return map;
  }, [draftKeybinds]);

  const conflictItems = useMemo(() => {
    const items: {
      action: KeybindAction;
      conflictAction: KeybindAction;
      previousOwner: KeybindAction | null;
      comboLabel: string;
    }[] = [];
    const seen = new Set<string>();

    for (const { action } of KEYBIND_ACTIONS) {
      const combo = draftKeybinds[action];
      const conflictAction = findConflict(combo, draftKeybinds, action);
      if (!conflictAction) continue;

      const key = [action, conflictAction].sort().join("|") + `|${formatCombo(combo)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let previousOwner: KeybindAction | null = null;
      if (combosEqual(keybinds[action], combo)) {
        previousOwner = action;
      } else if (combosEqual(keybinds[conflictAction], combo)) {
        previousOwner = conflictAction;
      }

      items.push({
        action,
        conflictAction,
        previousOwner,
        comboLabel: formatCombo(combo),
      });
    }

    return items;
  }, [draftKeybinds, keybinds]);

  const handleDiscard = () => {
    setRecordingAction(null);
    setDraftKeybinds({ ...keybinds });
  };

  const handleSave = () => {
    setRecordingAction(null);
    if (conflictItems.length > 0) {
      setIsConflictModalOpen(true);
      return;
    }

    void setAllKeybinds(draftKeybinds);
  };

  const handleResetDefaults = () => {
    setRecordingAction(null);
    setDraftKeybinds({ ...DEFAULT_KEYBINDS });
  };

  return (
    <div className="flex flex-col gap-4 w-full h-full bg-background text-foreground p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="text-xs uppercase tracking-wider text-foreground">Keybinds</div>
          {hasUnsavedChanges && <div className="text-[11px] text-warning">Unsaved changes</div>}
          {conflictItems.length > 0 && (
            <div className="text-[11px] text-destructive">Conflicting keybinds</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasCustomBindings && (
            <button
              type="button"
              onClick={handleResetDefaults}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
            >
              Reset to defaults
            </button>
          )}
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

      <div className="flex flex-col gap-1">
        {KEYBIND_ACTIONS.map(({ action, label, description }) => (
          <KeybindRow
            key={action}
            action={action}
            label={label}
            description={description}
            combo={draftKeybinds[action]}
            isRecording={recordingAction === action}
            onStartRecording={() => handleStartRecording(action)}
            onCancelRecording={handleCancelRecording}
            onRecorded={(combo) => handleRecorded(action, combo)}
            conflict={conflictMap.get(action) ?? null}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 px-3 py-2 opacity-50">
        <div className="flex flex-col gap-0.5">
          <div className="text-sm text-foreground">Open selected result</div>
          <div className="text-xs text-muted-foreground">Open the highlighted result.</div>
        </div>
        <div className="flex items-center gap-2">
          <KeyToken>Enter</KeyToken>
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground mt-auto">
        Click a shortcut to rebind it. Press <kbd className="px-1 text-foreground">Esc</kbd> to
        cancel.
      </div>

      {isConflictModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-overlay"
            aria-label="Dismiss"
            onClick={() => setIsConflictModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg bg-background p-4">
            <div className="text-sm text-foreground">Conflicting keybinds</div>
            <div className="text-xs text-muted-foreground mt-1">
              These shortcuts overlap. Saving will unbind the older action(s).
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {conflictItems.map((item) => {
                const currentMeta = KEYBIND_ACTIONS.find((m) => m.action === item.action);
                const conflictMeta = KEYBIND_ACTIONS.find((m) => m.action === item.conflictAction);
                const previousMeta = item.previousOwner
                  ? KEYBIND_ACTIONS.find((m) => m.action === item.previousOwner)
                  : null;
                const otherAction =
                  item.previousOwner === item.action ? item.conflictAction : item.action;
                const otherMeta = KEYBIND_ACTIONS.find((m) => m.action === otherAction);

                return (
                  <div
                    key={`${item.action}-${item.conflictAction}-${item.comboLabel}`}
                    className="rounded-md bg-secondary px-3 py-2"
                  >
                    <div className="text-xs text-foreground">
                      <span className="text-foreground">{item.comboLabel}</span> is assigned to{" "}
                      <span className="text-foreground">{currentMeta?.label ?? item.action}</span>{" "}
                      and{" "}
                      <span className="text-foreground">
                        {conflictMeta?.label ?? item.conflictAction}
                      </span>
                      .
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {previousMeta ? (
                        <>
                          Saving will unbind{" "}
                          <span className="text-foreground">{previousMeta.label}</span> in favor of{" "}
                          <span className="text-foreground">{otherMeta?.label ?? otherAction}</span>
                          .
                        </>
                      ) : (
                        <>Only the first matching action will trigger.</>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConflictModalOpen(false)}
                className="text-xs transition-colors px-2 py-1 rounded text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsConflictModalOpen(false);
                  void setAllKeybinds(draftKeybinds);
                }}
                className="text-xs transition-colors px-2 py-1 rounded bg-destructive text-destructive-foreground"
              >
                Save anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
