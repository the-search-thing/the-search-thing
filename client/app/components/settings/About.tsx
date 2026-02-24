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
        'flex flex-1 min-h-0 flex-col items-center justify-center gap-3 w-full h-full',
        'border-1 border-zinc-700/80 bg-zinc-800/60',
        'p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
      )}
    >
      <img src={logoSrc} alt="Logo" className="w-[75px] h-[75px]" />
      <div className="items-center flex flex-col">
        <p className="text-lg text-zinc-200">the-search-thing</p>
        <p className="text-sm text-zinc-500 font-semibold">v0.1.0</p>
        <p className="text-xs text-zinc-500 py-2">by Karthik & Amaan</p>
      </div>
    </div>
  )
}
