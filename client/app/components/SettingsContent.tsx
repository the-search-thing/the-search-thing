import { cn } from '@/lib/utils'

type SettingsContentProps = {
  item: string
}

export default function SettingsContent({ item }: SettingsContentProps) {
  return (
    <div
      className={cn(
        'flex flex-1 min-h-0 flex-col items-start justify-start gap-3',
        'border-1 border-zinc-700/80 bg-zinc-800/60',
        'p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
      )}
    >
      <div className="text-xs uppercase tracking-wider text-zinc-500">Section</div>
      <div className="text-xl text-zinc-200">{item}</div>
      <p className="text-sm text-zinc-500">This is temporary content for the {item} settings section.</p>
    </div>
  )
}
