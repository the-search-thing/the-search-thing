import { useEffect } from 'react'
import { useWindowContext } from './WindowContext'
import { useTitlebarContext } from './TitlebarContext'
import { TitlebarMenu } from './TitlebarMenu'
import { useConveyor } from '@/app/hooks/use-conveyor'

const SVG_PATHS = {
  close: 'M 0,0 0,0.7 4.3,5 0,9.3 0,10 0.7,10 5,5.7 9.3,10 10,10 10,9.3 5.7,5 10,0.7 10,0 9.3,0 5,4.3 0.7,0 Z',
  maximize: 'M 0,0 0,10 10,10 10,0 Z M 1,1 9,1 9,9 1,9 Z',
  minimize: 'M 0,5 10,5 10,6 0,6 Z',
} as const

export const Titlebar = () => {
  const { title, icon, titleCentered, menuItems } = useWindowContext().titlebar
  const { menusVisible, setMenusVisible, closeActiveMenu } = useTitlebarContext()
  const { window: wcontext } = useWindowContext()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && menuItems?.length && !e.repeat) {
        if (menusVisible) closeActiveMenu()
        setMenusVisible(!menusVisible)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [menusVisible, closeActiveMenu, setMenusVisible, menuItems])

  const isDarwin = wcontext?.platform === 'darwin'
  const isWin32 = wcontext?.platform === 'win32'

  return (
    <div
      className={`
        flex relative h-10 items-center [-webkit-app-region:drag]
        bg-[var(--window-c-titlebar-background)] text-[var(--window-c-text)]
        transition-colors duration-300 border-b border-[var(--window-c-titlebar-border)]
        ${isDarwin ? '[&_.window-titlebar-title]:ml-20 [&_.window-titlebar-menu]:left-20' : ''}
      `}
    >
      {isWin32 && (
        <div className="absolute left-0 top-0 w-[42px] h-full px-2.5 box-border flex items-center justify-center">
          <img src={icon} className="w-full max-w-4" />
        </div>
      )}

      <div
        className={`
          window-titlebar-title flex-1 text-[13px] font-[var(--window-titlebar-font-weight,normal)]
          ${titleCentered ? 'text-center pl-0 ml-0' : 'ml-[42px] pl-1'}
          ${isDarwin && !titleCentered ? 'ml-20' : ''}
        `}
        {...(titleCentered && { 'data-centered': true })}
        style={{ visibility: menusVisible ? 'hidden' : 'visible' }}
      >
        {title}
      </div>
      {menusVisible && <TitlebarMenu />}
      {isWin32 && <TitlebarControls />}
    </div>
  )
}

const TitlebarControls = () => {
  const { window: wcontext } = useWindowContext()

  return (
    <div className="flex absolute right-0 top-0 [-webkit-app-region:no-drag]">
      {wcontext?.minimizable && <TitlebarControlButton label="minimize" svgPath={SVG_PATHS.minimize} />}
      {wcontext?.maximizable && <TitlebarControlButton label="maximize" svgPath={SVG_PATHS.maximize} />}
      <TitlebarControlButton label="close" svgPath={SVG_PATHS.close} />
    </div>
  )
}

const TitlebarControlButton = ({ svgPath, label }: { svgPath: string; label: string }) => {
  const { windowMinimize, windowMaximizeToggle, windowClose } = useConveyor('window')

  const handleAction = () => {
    const actions = {
      minimize: windowMinimize,
      maximize: windowMaximizeToggle,
      close: windowClose,
    }
    actions[label as keyof typeof actions]?.()
  }

  const isClose = label === 'close'

  return (
    <div
      aria-label={label}
      className={`
        flex items-center justify-center w-9 h-[30px] cursor-pointer bg-transparent
        hover:bg-[var(--window-c-control-hover)]
        ${isClose ? 'hover:!bg-[var(--window-c-control-close-hover)] hover:text-[var(--window-c-control-close-hover-text,inherit)]' : ''}
      `}
      onClick={handleAction}
    >
      <svg width="10" height="10">
        <path fill="currentColor" d={svgPath} />
      </svg>
    </div>
  )
}

export interface TitlebarProps {
  title: string
  titleCentered?: boolean
  icon?: string
  menuItems?: TitlebarMenu[]
}
