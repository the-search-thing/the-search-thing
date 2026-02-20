import { cn } from '@/lib/utils'

export default function Keybinds() {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        'w-full h-full',
        'border-1 border-zinc-700/80 bg-zinc-800/60',
        'p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
      )}
    >
      <div className="text-xs uppercase tracking-wider text-zinc-500">Keybinds</div>
      <div className="text-xl text-zinc-200">Keybinds Settings</div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-200">Search</div>
            <div className="text-xs text-zinc-500">Run search from the search bar.</div>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 text-xs text-zinc-300 bg-zinc-700/50 border border-zinc-600 rounded">Enter</kbd>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-200">Index directory</div>
            <div className="text-xs text-zinc-500">Open the indexing dialog.</div>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 text-xs text-zinc-300 bg-zinc-700/50 border border-zinc-600 rounded">Alt</kbd>
            <span className="text-xs text-zinc-500">+</span>
            <kbd className="px-2 py-1 text-xs text-zinc-300 bg-zinc-700/50 border border-zinc-600 rounded">F</kbd>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-200">Open selected result</div>
            <div className="text-xs text-zinc-500">Open the highlighted result.</div>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 text-xs text-zinc-300 bg-zinc-700/50 border border-zinc-600 rounded">Enter</kbd>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-200">Open result (new window)</div>
            <div className="text-xs text-zinc-500">Open via modifier + click.</div>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 text-xs text-zinc-300 bg-zinc-700/50 border border-zinc-600 rounded">Ctrl</kbd>
            <span className="text-xs text-zinc-500">/</span>
            <kbd className="px-2 py-1 text-xs text-zinc-300 bg-zinc-700/50 border border-zinc-600 rounded">Cmd</kbd>
            <span className="text-xs text-zinc-500">+</span>
            <kbd className="px-2 py-1 text-xs text-zinc-300 bg-zinc-700/50 border border-zinc-600 rounded">Click</kbd>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-200">Open settings</div>
            <div className="text-xs text-zinc-500">No shortcut assigned yet.</div>
          </div>
          <div className="text-xs text-zinc-500">Unassigned</div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-200">Toggle About popover</div>
            <div className="text-xs text-zinc-500">No shortcut assigned yet.</div>
          </div>
          <div className="text-xs text-zinc-500">Unassigned</div>
        </div>
      </div>
    </div>
  )
}
