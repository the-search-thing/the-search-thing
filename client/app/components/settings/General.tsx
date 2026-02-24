import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { useGeneralSettings } from '@/app/hooks/use-general-settings'
import type { GeneralSettingsState } from '@/lib/storage/general-settings'

type DraftGeneralSettings = Pick<GeneralSettingsState,'launch-on-startup' | 'theme' | 'font' | 'scope'>

export default function General() {
  const { settings, setAllSettings } = useGeneralSettings()
  const searchApi = useConveyor('search')
  const [draftSettings, setDraftSettings] = useState<DraftGeneralSettings>({
    "launch-on-startup": settings['launch-on-startup'],
    theme: settings.theme,
    font: settings.font,
    scope: settings.scope,
  })
  const [status, setStatus] = useState<'idle' | 'saved' | 'cleared'>('idle')

  useEffect(() => {
    setDraftSettings({
      "launch-on-startup": settings['launch-on-startup'],
      theme: settings.theme,
      font: settings.font,
      scope: settings.scope,
    })
  }, [settings['launch-on-startup'], settings.theme, settings.font, settings.scope])

  useEffect(() => {
    if (status === 'idle') return

    const timeoutId = window.setTimeout(() => {
      setStatus('idle')
    }, 1500)

    return () => window.clearTimeout(timeoutId)
  }, [status])

  useEffect(() => {
    const root = document.documentElement
    const isDark = draftSettings.theme === 'dark'

    root.classList.toggle('dark', isDark)
    root.classList.toggle('light', !isDark)

    return () => {
      const isDarkSetting = settings.theme === 'dark'
      root.classList.toggle('dark', isDarkSetting)
      root.classList.toggle('light', !isDarkSetting)
    }
  }, [draftSettings.theme, settings.theme])

  useEffect(() => {
    document.body.dataset.font = draftSettings.font

    return () => {
      document.body.dataset.font = settings.font
    }
  }, [draftSettings.font, settings.font])

  const hasUnsavedChanges = useMemo(() => {
    return (
      draftSettings['launch-on-startup'] !== settings['launch-on-startup'] ||
      draftSettings.theme !== settings.theme ||
      draftSettings.font !== settings.font ||
      draftSettings.scope !== settings.scope
    )
  }, [draftSettings, settings])

  const handleDiscard = () => {
    setDraftSettings({
      'launch-on-startup': settings['launch-on-startup'],
      theme: settings.theme,
      font: settings.font,
      scope: settings.scope,
    })
  }

  const handleSave = () => {
    const nextSettings: GeneralSettingsState = {
      ...settings,
      ...draftSettings,
    }
    setStatus('saved')
    void setAllSettings(nextSettings)
  }

  const handleClearRecentSearches = async () => {
    try {
      await searchApi.pruneSearchHistory(0)
      setStatus('cleared')
    } catch (error) {
      console.error('Failed to clear recent searches:', error)
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        'w-full h-full',
        'border-1 border-zinc-700/80 bg-zinc-800/60',
        'p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="text-xs uppercase tracking-wider text-zinc-500">General</div>
          {hasUnsavedChanges && <div className="text-[11px] text-amber-700/80 dark:text-amber-600/80">Unsaved changes</div>}
          {status === 'saved' && <div className="text-[11px] text-emerald-700/80 dark:text-emerald-600/80">Saved</div>}
          {status === 'cleared' && <div className="text-[11px] text-emerald-700/80 dark:text-emerald-600/80">Cleared</div>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDiscard}
            disabled={!hasUnsavedChanges}
            className={cn(
              'text-xs transition-colors px-2 py-1 rounded border',
              hasUnsavedChanges
                ? 'text-zinc-300 hover:text-zinc-200 border-zinc-600 hover:border-zinc-500 dark:text-zinc-400 dark:hover:text-zinc-200 dark:border-zinc-700 dark:hover:border-zinc-500'
                : 'text-zinc-500 border-zinc-700 cursor-not-allowed dark:text-zinc-600 dark:border-zinc-800'
            )}
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasUnsavedChanges}
            className={cn(
              'text-xs transition-colors px-2 py-1 rounded border',
              hasUnsavedChanges
                ? 'text-emerald-700 border-emerald-700/70 hover:border-emerald-600 dark:text-emerald-600 dark:border-emerald-600/60 dark:hover:border-emerald-600'
                : 'text-zinc-500 border-zinc-700 cursor-not-allowed dark:text-zinc-600 dark:border-zinc-800'
            )}
          >
            Save
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-200">Launch at startup</div>
            <div className="text-xs text-zinc-500">Open the app when you sign in.</div>
          </div>
          <button
            type="button"
            onClick={() =>
              setDraftSettings((prev) => ({
                ...prev,
                'launch-on-startup': !prev['launch-on-startup'],
              }))
            }
            className="h-7 px-3 rounded-md text-xs text-zinc-200 bg-zinc-700/60 hover:bg-zinc-700 transition-colors duration-150"
          >
            {draftSettings['launch-on-startup'] ? 'On' : 'Off'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-200">Theme</div>
            <div className="text-xs text-zinc-500">Choose light or dark mode.</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDraftSettings((prev) => ({ ...prev, theme: 'dark' }))}
              className={cn(
                'h-7 px-3 rounded-md text-xs transition-colors duration-150',
                draftSettings.theme === 'dark'
                  ? 'text-zinc-100 bg-zinc-600/80 ring-1 ring-zinc-500/70'
                  : 'text-zinc-200 bg-zinc-700/60 hover:bg-zinc-700'
              )}
            >
              Dark
            </button>
            <button
              type="button"
              onClick={() => setDraftSettings((prev) => ({ ...prev, theme: 'light' }))}
              className={cn(
                'h-7 px-3 rounded-md text-xs transition-colors duration-150',
                draftSettings.theme === 'light'
                  ? 'text-zinc-100 bg-zinc-600/80 ring-1 ring-zinc-500/70'
                  : 'text-zinc-200 bg-zinc-700/60 hover:bg-zinc-700'
              )}
            >
              Light
            </button>
          </div>
        </div>
        
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-200">Font</div>
            <div className="text-xs text-zinc-500">Choose Sans-Serif or Mono.</div>
          </div>
          <select
            value={draftSettings.font}
            onChange={(event) =>
              setDraftSettings((prev) => ({
                ...prev,
                font: event.target.value as 'sans-serif' | 'mono',
              }))
            }
            className="h-7 rounded-md bg-zinc-800/60 border-1 border-zinc-600/80 text-xs text-zinc-200 px-2"
          >
            <option value="sans-serif">Sans-Serif</option>
            <option value="mono">Mono</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-200">Search scope</div>
            <div className="text-xs text-zinc-500">Files, folders, or both.</div>
          </div>
          <select
            value={draftSettings.scope}
            onChange={(event) =>
              setDraftSettings((prev) => ({
                ...prev,
                scope: event.target.value as 'both' | 'files' | 'folders',
              }))
            }
            className="h-7 rounded-md bg-zinc-800/60 border-1 border-zinc-600/80 text-xs text-zinc-200 px-2"
          >
            <option value="both">Everything</option>
            <option value="files">Files Only</option>
            <option value="folders">Folders Only</option>
          </select> 
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-200">Clear recent searches</div>
            <div className="text-xs text-zinc-500">Remove cached query history.</div>
          </div>
          <button
            type="button"
            onClick={() => void handleClearRecentSearches()}
            className="h-7 px-3 rounded-md text-xs text-zinc-200 bg-zinc-700/60 hover:bg-zinc-700 transition-colors duration-150"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}
