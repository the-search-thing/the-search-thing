import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'
import About from './About'
import General from './General'
import Keybinds from './Keybinds'

type SettingsContentProps = {
  item: string
}

const components: Record<string, ComponentType> = {
  About,
  General,
  Keybinds,
}

export default function SettingsContent({ item }: SettingsContentProps) {
  const ComponentToRender = components[item as keyof typeof components]

  if (!ComponentToRender) {
    return null
  }

  return (
    <div
      className={cn(
        'flex flex-1 min-h-0 flex-col items-start justify-start gap-3',
        ' border-zinc-700/80 bg-zinc-800/60',
        'shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
      )}
    >
      <ComponentToRender />
    </div>
  )
}
