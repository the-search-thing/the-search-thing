import { cn } from '@/lib/utils'
import About from './About'
import General from './General'
import Keybinds from './Keybinds'

type SettingsContentProps = {
  item: string
}

const sections = [
  { key: 'General', Component: General },
  { key: 'Keybinds', Component: Keybinds },
  { key: 'About', Component: About },
] as const

export default function SettingsContent({ item }: SettingsContentProps) {
  const hasMatch = sections.some((section) => section.key === item)

  if (!hasMatch) return null

  return (
    <div
      className={cn(
        'flex flex-1 min-h-0 flex-col items-start justify-start gap-3 overflow-hidden',
        'bg-transparent'
      )}
    >
      {sections.map(({ key, Component }) => (
        <div key={key} className={cn('h-full w-full', item === key ? 'block' : 'hidden')} aria-hidden={item !== key}>
          <Component />
        </div>
      ))}
    </div>
  )
}
