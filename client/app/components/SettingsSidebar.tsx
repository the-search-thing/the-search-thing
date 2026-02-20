import { cn } from '@/lib/utils'

const items = ['General', 'About', 'Keybinds'] as const

export default function SettingsSidebar() {
  return (
    <div
      className={cn(
        'flex flex-col gap-2',
        'w-56 flex-none',
        'border-2 border-zinc-700/80 bg-zinc-800/60',
        'p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
      )}
    >
      <div className="text-xs uppercase tracking-wider text-zinc-500 px-1">Settings</div>
      <nav className="flex flex-col gap-1">
        {items.map((label) => (
          <button
            key={label}
            type="button"
            className={cn(
              'flex items-center justify-start',
              'h-9 w-full rounded-md px-2',
              'text-zinc-300 hover:text-zinc-100',
              'hover:bg-zinc-700/60',
              'transition-colors duration-150'
            )}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
