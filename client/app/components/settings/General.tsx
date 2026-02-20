import { cn } from '@/lib/utils'

export default function General() {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        'w-full h-full',
        'border-1 border-zinc-700/80 bg-zinc-800/60',
        'p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
      )}
    >
      <div className="text-xs uppercase tracking-wider text-zinc-500">General</div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-200">Launch at startup</div>
            <div className="text-xs text-zinc-500">Open the app when you sign in.</div>
          </div>
          <button
            type="button"
            className="h-7 px-3 rounded-md text-xs text-zinc-200 bg-zinc-700/60 hover:bg-zinc-700 transition-colors duration-150"
          >
            Toggle
          </button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-200">Check for updates</div>
            <div className="text-xs text-zinc-500">Automatically download updates.</div>
          </div>
          <button
            type="button"
            className="h-7 px-3 rounded-md text-xs text-zinc-200 bg-zinc-700/60 hover:bg-zinc-700 transition-colors duration-150"
          >
            Toggle
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
              className="h-7 px-3 rounded-md text-xs text-zinc-200 bg-zinc-700/60 hover:bg-zinc-700 transition-colors duration-150"
            >
              Dark
            </button>
            <button
              type="button"
              className="h-7 px-3 rounded-md text-xs text-zinc-200 bg-zinc-700/60 hover:bg-zinc-700 transition-colors duration-150"
            >
              Light
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-200">Search scope</div>
            <div className="text-xs text-zinc-500">Files, folders, or both.</div>
          </div>
          <select className="h-7 rounded-md bg-zinc-800/60 border-1 border-zinc-700/80 text-xs text-zinc-200 px-2">
            <option>Files & Folders</option>
            <option>Files Only</option>
            <option>Folders Only</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-200">Clear recent searches</div>
            <div className="text-xs text-zinc-500">Remove cached query history.</div>
          </div>
          <button
            type="button"
            className="h-7 px-3 rounded-md text-xs text-zinc-200 bg-zinc-700/60 hover:bg-zinc-700 transition-colors duration-150"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}
