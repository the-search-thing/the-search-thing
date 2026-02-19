import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Settings as SettingsIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Settings() {
  const navigate = useNavigate()

  return (
    <div className="flex gap-5 h-screen">

      {/* Placeholder body */}
      <div
        className={cn(
          'flex flex-1 min-h-0 flex-col items-center justify-center gap-3',
          'border-2 border-zinc-700/80 bg-zinc-800/60',
          'px-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
        )}
      >
        <button
          onClick={() => navigate('/')}
          className={cn(
            'flex items-center justify-center',
            'h-8 w-8 rounded-md',
            'text-zinc-400 hover:text-zinc-100',
            'hover:bg-zinc-700/60',
            'transition-colors duration-150'
          )}
          aria-label="Back to search"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <SettingsIcon className="h-12 w-12 text-zinc-600" />
        <p className="text-lg text-zinc-400">Settings coming soon</p>
        <p className="text-sm text-zinc-600">This page is a placeholder.</p>
      </div>
    </div>
  )
}
