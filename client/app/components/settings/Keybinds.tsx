import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useKeybinds } from '@/app/hooks/use-keybinds'
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
} from '@/lib/storage/keybind-store'

function KeyToken({ children }: { children: string }) {
  return <kbd className="px-2 py-1 text-xs text-zinc-300 bg-zinc-700/50 border border-zinc-600 rounded">{children}</kbd>
}

function ComboDisplay({ combo }: { combo: KeyCombo }) {
  const tokens = comboTokens(combo)
  return (
    <div className="flex items-center gap-2">
      {tokens.map((token, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-xs text-zinc-500">+</span>}
          <KeyToken>{token}</KeyToken>
        </span>
      ))}
    </div>
  )
}

type KeybindRowProps = {
  action: KeybindAction
  label: string
  description: string
  combo: KeyCombo
  isRecording: boolean
  onStartRecording: () => void
  onCancelRecording: () => void
  onRecorded: (combo: KeyCombo) => void
  conflict: string | null
}

function KeybindRow({
  action,
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
    if (!isRecording) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        onCancelRecording()
        return
      }

      const newCombo = comboFromEvent(e)
      if (newCombo) {
        onRecorded(newCombo)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isRecording, onCancelRecording, onRecorded])

  const isDefault = combosEqual(combo, DEFAULT_KEYBINDS[action])

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-3 py-2 rounded-md transition-colors',
        isRecording && 'bg-zinc-700/40 ring-1 ring-amber-500/50',
        conflict && 'bg-rose-500/10 ring-1 ring-rose-400/40'
      )}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="text-sm text-zinc-200">{label}</div>
        <div className="text-xs text-zinc-500">{description}</div>
        {conflict && <div className="text-xs text-rose-300/80 mt-0.5">Conflicts with: {conflict}</div>}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {isRecording ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-400 animate-pulse">Press keys…</span>
            <button
              type="button"
              onClick={onCancelRecording}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-1.5 py-0.5 rounded border border-zinc-600/50 hover:border-zinc-500"
            >
              Esc
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartRecording}
            className={cn(
              'flex items-center gap-2 group cursor-pointer',
              'rounded-md px-2 py-1 -mx-2 -my-1',
              'hover:bg-zinc-700/50 transition-colors'
            )}
            title="Click to rebind"
          >
            <ComboDisplay combo={combo} />
            {!isDefault && (
              <span className="text-[10px] text-zinc-600 group-hover:text-zinc-400 transition-colors ml-1">•</span>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export default function Keybinds() {
  const { keybinds, setAllKeybinds } = useKeybinds()
  const [recordingAction, setRecordingAction] = useState<KeybindAction | null>(null)
  const [draftKeybinds, setDraftKeybinds] = useState(() => ({ ...keybinds }))
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false)

  useEffect(() => {
    setDraftKeybinds({ ...keybinds })
  }, [keybinds])

  useEffect(() => {
    const isRecording = recordingAction !== null
    if (isRecording) {
      document.body.dataset.keybindRecording = 'true'
    } else {
      delete document.body.dataset.keybindRecording
    }

    return () => {
      delete document.body.dataset.keybindRecording
    }
  }, [recordingAction])

  const handleStartRecording = (action: KeybindAction) => {
    setRecordingAction(action)
  }

  const handleCancelRecording = () => {
    setRecordingAction(null)
  }

  const handleRecorded = (action: KeybindAction, combo: KeyCombo) => {
    setDraftKeybinds((prev) => ({ ...prev, [action]: combo }))
    setRecordingAction(null)
  }

  const hasCustomBindings = KEYBIND_ACTIONS.some(
    ({ action }) => !combosEqual(draftKeybinds[action], DEFAULT_KEYBINDS[action])
  )

  const hasUnsavedChanges = useMemo(() => {
    return KEYBIND_ACTIONS.some(({ action }) => !combosEqual(draftKeybinds[action], keybinds[action]))
  }, [draftKeybinds, keybinds])

  const conflictMap = useMemo(() => {
    const map = new Map<KeybindAction, string>()
    for (const { action } of KEYBIND_ACTIONS) {
      const conflictAction = findConflict(draftKeybinds[action], draftKeybinds, action)
      if (conflictAction) {
        const meta = KEYBIND_ACTIONS.find((m) => m.action === conflictAction)
        map.set(action, meta?.label ?? conflictAction)
      }
    }
    return map
  }, [draftKeybinds])

  const conflictItems = useMemo(() => {
    const items: {
      action: KeybindAction
      conflictAction: KeybindAction
      previousOwner: KeybindAction | null
      comboLabel: string
    }[] = []
    const seen = new Set<string>()

    for (const { action } of KEYBIND_ACTIONS) {
      const combo = draftKeybinds[action]
      const conflictAction = findConflict(combo, draftKeybinds, action)
      if (!conflictAction) continue

      const key = [action, conflictAction].sort().join('|') + `|${formatCombo(combo)}`
      if (seen.has(key)) continue
      seen.add(key)

      let previousOwner: KeybindAction | null = null
      if (combosEqual(keybinds[action], combo)) {
        previousOwner = action
      } else if (combosEqual(keybinds[conflictAction], combo)) {
        previousOwner = conflictAction
      }

      items.push({
        action,
        conflictAction,
        previousOwner,
        comboLabel: formatCombo(combo),
      })
    }

    return items
  }, [draftKeybinds, keybinds])

  const handleDiscard = () => {
    setRecordingAction(null)
    setDraftKeybinds({ ...keybinds })
  }

  const handleSave = () => {
    setRecordingAction(null)
    if (conflictItems.length > 0) {
      setIsConflictModalOpen(true)
      return
    }

    void setAllKeybinds(draftKeybinds)
  }

  const handleResetDefaults = () => {
    setRecordingAction(null)
    setDraftKeybinds({ ...DEFAULT_KEYBINDS })
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        'w-full h-full',
        'border-2 border-zinc-700/80 bg-zinc-800/60',
        'p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Keybinds</div>
          {hasUnsavedChanges && <div className="text-[11px] text-amber-300/80">Unsaved changes</div>}
          {conflictItems.length > 0 && <div className="text-[11px] text-rose-300/80">Conflicting keybinds</div>}
        </div>
        <div className="flex items-center gap-2">
          {hasCustomBindings && (
            <button
              onClick={handleResetDefaults}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded border border-zinc-700 hover:border-zinc-500"
            >
              Reset to defaults
            </button>
          )}
          <button
            onClick={handleDiscard}
            disabled={!hasUnsavedChanges}
            className={cn(
              'text-xs transition-colors px-2 py-1 rounded border',
              hasUnsavedChanges
                ? 'text-zinc-400 hover:text-zinc-200 border-zinc-700 hover:border-zinc-500'
                : 'text-zinc-600 border-zinc-800 cursor-not-allowed'
            )}
          >
            Discard
          </button>
          <button
            onClick={handleSave}
            disabled={!hasUnsavedChanges}
            className={cn(
              'text-xs transition-colors px-2 py-1 rounded border',
              hasUnsavedChanges
                ? 'text-emerald-200 border-emerald-500/60 hover:border-emerald-400'
                : 'text-zinc-600 border-zinc-800 cursor-not-allowed'
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

      {/* Static Enter row — not customizable per user request */}
      <div className="flex items-center justify-between gap-4 px-3 py-2 opacity-50">
        <div className="flex flex-col gap-0.5">
          <div className="text-sm text-zinc-200">Open selected result</div>
          <div className="text-xs text-zinc-500">Open the highlighted result.</div>
        </div>
        <div className="flex items-center gap-2">
          <KeyToken>Enter</KeyToken>
        </div>
      </div>

      <div className="text-[11px] text-zinc-600 mt-auto">
        Click a shortcut to rebind it. Press <kbd className="px-1 text-zinc-500">Esc</kbd> to cancel.
      </div>

      {isConflictModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsConflictModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900/95 p-4 shadow-xl">
            <div className="text-sm text-zinc-200">Conflicting keybinds</div>
            <div className="text-xs text-zinc-400 mt-1">
              These shortcuts overlap. Saving will unbind the older action(s).
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {conflictItems.map((item) => {
                const currentMeta = KEYBIND_ACTIONS.find((m) => m.action === item.action)
                const conflictMeta = KEYBIND_ACTIONS.find((m) => m.action === item.conflictAction)
                const previousMeta = item.previousOwner
                  ? KEYBIND_ACTIONS.find((m) => m.action === item.previousOwner)
                  : null
                const otherAction = item.previousOwner === item.action ? item.conflictAction : item.action
                const otherMeta = KEYBIND_ACTIONS.find((m) => m.action === otherAction)

                return (
                  <div
                    key={`${item.action}-${item.conflictAction}-${item.comboLabel}`}
                    className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                  >
                    <div className="text-xs text-zinc-200">
                      <span className="text-zinc-100">{item.comboLabel}</span>{' '}
                      is assigned to{' '}
                      <span className="text-zinc-100">{currentMeta?.label ?? item.action}</span> and{' '}
                      <span className="text-zinc-100">{conflictMeta?.label ?? item.conflictAction}</span>.
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1">
                      {previousMeta ? (
                        <>
                          Saving will unbind{' '}
                          <span className="text-zinc-300">{previousMeta.label}</span> in favor of{' '}
                          <span className="text-zinc-300">{otherMeta?.label ?? otherAction}</span>.
                        </>
                      ) : (
                        <>Only the first matching action will trigger.</>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsConflictModalOpen(false)}
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-1 rounded border border-zinc-700 hover:border-zinc-500"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setIsConflictModalOpen(false)
                  void setAllKeybinds(draftKeybinds)
                }}
                className="text-xs text-rose-200 border border-rose-500/60 hover:border-rose-400 transition-colors px-2 py-1 rounded"
              >
                Save anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
