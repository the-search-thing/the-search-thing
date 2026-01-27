// components/raycast-searchbar.tsx
import * as React from "react"
import { cn } from "@/lib/utils"

type SearchbarProps = React.ComponentProps<"input"> & {
  kbd?: string
}

export function Searchbar({
  className,
  ...props
}: SearchbarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        "h-full w-screen rounded-2xl",
        "border border-zinc-800/80 bg-zinc-950/60",
        "px-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]",
        "focus-within:border-zinc-700 focus-within:ring-2 focus-within:ring-zinc-700/40",
        className
      )}
    >
      {/* left icon */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4 text-zinc-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m21 21-4.3-4.3" />
        <circle cx="11" cy="11" r="7" />
      </svg>

      <input
        type="search"
        className={cn(
          "w-full bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-500",
          "outline-none"
        )}
        placeholder="Search…"
        {...props}
      />
    </div>
  )
}
