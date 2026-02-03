import { useEffect, useRef } from 'react'
import { useWindowContext } from '@/app/components/window'
import { useTitlebarContext } from './TitlebarContext'
import { useConveyor } from '@/app/hooks/use-conveyor'

const TitlebarMenu = () => {
  const { menuItems } = useWindowContext().titlebar
  if (!menuItems) return null

  return (
    <div className="flex flex-row gap-0.5 absolute top-[9px] left-[42px] [-webkit-app-region:no-drag] text-[13px] platform-darwin:left-20">
      {menuItems.map((menu, index) => (
        <TitlebarMenuItem key={index} menu={menu} index={index} />
      ))}
    </div>
  )
}

const TitlebarMenuItem = ({ menu, index }: { menu: TitlebarMenu; index: number }) => {
  const { activeMenuIndex, setActiveMenuIndex } = useTitlebarContext()
  const menuItemRef = useRef<HTMLDivElement>(null)

  const isActive = activeMenuIndex === index

  const togglePopup = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (activeMenuIndex === index) {
      setActiveMenuIndex(null)
    } else {
      setActiveMenuIndex(index)
    }
  }

  const handleMouseOver = () => {
    if (activeMenuIndex != null) setActiveMenuIndex(index)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuItemRef.current && !menuItemRef.current.contains(target) && isActive) {
        setActiveMenuIndex(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [setActiveMenuIndex, isActive])

  return (
    <div className="relative" ref={menuItemRef}>
      <div
        className={`
          py-0.5 px-2 cursor-pointer rounded font-[var(--window-titlebar-font-weight,normal)]
          hover:bg-[var(--window-c-hover)]
          ${isActive ? 'bg-[var(--window-c-hover)]' : ''}
        `}
        onClick={togglePopup}
        onMouseOver={handleMouseOver}
        onMouseDown={(e) => e.preventDefault()}
      >
        {menu.name}
      </div>
      {isActive && <TitlebarMenuPopup menu={menu} />}
    </div>
  )
}

const TitlebarMenuPopup = ({ menu }: { menu: TitlebarMenu }) => (
  <div
    className="
      fixed bg-[var(--window-c-popup-background)] top-8 min-w-[100px]
      border border-[var(--window-c-popup-border)] py-1 px-0
      shadow-[2px_1px_4px_var(--window-c-popup-shadow)] z-[10000] rounded
    "
  >
    {menu.items.map((item, index) => (
      <TitlebarMenuPopupItem key={index} item={item} />
    ))}
  </div>
)

const TitlebarMenuPopupItem = ({ item }: { item: TitlebarMenuItem }) => {
  const { setActiveMenuIndex } = useTitlebarContext()
  const { invoke } = useConveyor('window')

  const handleAction = () => {
    if (typeof item.actionCallback === 'function') {
      item.actionCallback()
    } else if (item.action) {
      invoke(item.action as any, ...(item.actionParams || []))
    }
    setActiveMenuIndex(null)
  }

  if (item.name === '---') {
    return <div className="border-t border-[var(--window-c-separator)] mt-1.5 py-[3px] px-0 pointer-events-none" />
  }

  return (
    <div
      className="
        flex flex-row py-[5px] px-[18px]
        [text-shadow:1px_1px_var(--window-c-text-shadow)]
        justify-between font-[var(--window-c-popup-font-weight,normal)]
        hover:bg-[var(--window-c-hover)] cursor-pointer
      "
      onClick={handleAction}
    >
      <div>{item.name}</div>
      {item.shortcut && <div className="opacity-50 ml-12">{item.shortcut}</div>}
    </div>
  )
}

interface TitlebarMenuItem {
  name: string
  action?: string
  actionParams?: (string | number | object)[]
  shortcut?: string
  items?: TitlebarMenuItem[]
  actionCallback?: () => void
}

interface TitlebarMenu {
  name: string
  items: TitlebarMenuItem[]
}

export { TitlebarMenu, TitlebarMenuItem, TitlebarMenuPopup, TitlebarMenuPopupItem }
