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
      <p className="text-sm text-zinc-500">Placeholder content for keybind settings. Add real options here later.</p>
    </div>
  )
}
