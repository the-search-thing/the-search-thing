import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Settings as SettingsIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import SettingsSidebar from '../components/SettingsSidebar'
import SettingsContent from '../components/SettingsContent'

export default function Settings() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div
        className={cn(
          'flex flex-row items-center flex-none min-h-[35px]',
          'bg-zinc-800/60 px-4',
          'shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
        )}
      >
        <button
          onClick={() => navigate('/')}
          className={cn(
            'flex items-center justify-center',
            'h-5 w-5 rounded-md',
            'text-zinc-400 hover:text-zinc-100',
            'hover:bg-zinc-700/60',
            'transition-colors duration-150'
          )}
          aria-label="Back to search"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      <div
        className={cn(
          'flex flex-1 min-h-0 flex-row items-center justify-center gap-3',
          'border-2 border-zinc-700/80 bg-zinc-800/60',
          'px-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
        )}
      >
        <div>
          <SettingsSidebar />
        </div>
        <div>
          <SettingsContent />
        </div>
      </div>
    </div>
  )
}
