import * as React from 'react'
import { cn } from '@/lib/utils'

type SearchbarProps = React.ComponentProps<'input'> & {
  kbd?: string
}

export const Searchbar = React.forwardRef<HTMLInputElement, SearchbarProps>(function Searchbar(
  { className, kbd, ...props },
  ref
) {
  return (
    <div
      className={cn(
        'flex items-center gap-3',
        'h-full w-full',
        'px-4',
        className
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-6 w-6 text-zinc-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m21 21-4.3-4.3" />
        <circle cx="11" cy="11" r="7" />
      </svg>

      <input
        ref={ref}
        className={cn('w-full bg-transparent text-lg text-zinc-100 placeholder:text-zinc-500', 'outline-none')}
        placeholder="Search for files or folders…"
        {...props}
      />

      {kbd && (
        <kbd className="px-2 py-1 text-sm text-zinc-400 bg-zinc-700/50 border border-zinc-600">{kbd}</kbd>
      )}
    </div>
  )
})
