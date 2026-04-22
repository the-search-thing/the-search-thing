import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import SettingsSidebar from '../components/settings/SettingsSidebar'
import SettingsContent from '../components/settings/SettingsContent'

export default function Settings() {
  const navigate = useNavigate()
  const [selectedItem, setSelectedItem] = useState<string>('General')

  const handleSelect = (item: string) => {
    setSelectedItem(item)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden ">
      <div
        className={cn(
          'flex min-h-[40px] flex-none flex-row items-center border border-zinc-700/70',
          'bg-zinc-800/60 px-3',
          'shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
        )}
      >
        <button
          onClick={() => navigate('/')}
          className={cn(
            'flex items-center justify-center',
            'h-8 w-8',
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
          'flex flex-1 min-h-0 flex-row items-stretch overflow-hidden',
          'bg-zinc-800/60',
          'shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
        )}
      >
        <SettingsSidebar selectedItem={selectedItem} onSelect={handleSelect} />
        <SettingsContent item={selectedItem} />
      </div>
    </div>
  )
}
