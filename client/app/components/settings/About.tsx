import { cn } from '@/lib/utils'
import darkLogo from '../../../../branding/logo-white-bg.webp'
import lightLogo from '../../../../branding/logo-no-bg.webp'
import { useGeneralSettings } from '@/app/hooks/use-general-settings'

export default function About() {
  const { settings } = useGeneralSettings()
  const logoSrc = settings.theme === 'dark' ? darkLogo : lightLogo

  return (
    <div
      className={cn(
        'flex h-full w-full flex-1 flex-col items-center justify-center gap-5',
        'border border-zinc-700/80 bg-zinc-800/60',
        'px-8 py-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
      )}
    >
      <img src={logoSrc} alt="Logo" className="h-[76px] w-[76px] border border-zinc-700/80 bg-zinc-900/30 p-1.5" />

      <div className="flex flex-col items-center gap-1">
        <p className="text-lg font-medium tracking-tight text-zinc-100">the-search-thing</p>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Version 0.1.0</p>
      </div>

      <div className="h-px w-52 bg-zinc-700/80" />

      <div className="flex w-full max-w-sm items-center justify-between gap-4 border border-zinc-700/70 bg-zinc-900/30 px-3 py-2 text-xs">
        <span className="uppercase tracking-wider text-zinc-500">Created by</span>
        <span className="text-zinc-200">Karthik & Amaan</span>
      </div>
    </div>
  )
}
