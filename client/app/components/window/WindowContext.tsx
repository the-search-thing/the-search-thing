import { createContext, useContext, useEffect, useState } from 'react'
import { Titlebar, TitlebarProps } from './Titlebar'
import { TitlebarContextProvider } from './TitlebarContext'
import type { ChannelReturn } from '@/lib/conveyor/schemas'
import { useConveyor } from '@/app/hooks/use-conveyor'

type WindowInitProps = ChannelReturn<'window-init'>

interface WindowContextProps {
  titlebar: TitlebarProps
  readonly window: WindowInitProps | undefined
}

const WindowContext = createContext<WindowContextProps | undefined>(undefined)

export const WindowContextProvider = ({
  children,
  titlebar = {
    title: 'Electron React App',
    icon: 'appIcon.png',
    titleCentered: false,
    menuItems: [],
  },
}: {
  children: React.ReactNode
  titlebar?: TitlebarProps
}) => {
  const [initProps, setInitProps] = useState<WindowInitProps>()
  const { windowInit } = useConveyor('window')

  useEffect(() => {
    windowInit().then(setInitProps)

    // Add Tailwind classes to parent element
    const parent = document.querySelector('.window-content')?.parentElement
    parent?.classList.add(
      'flex',
      'flex-col',
      'select-none',
      'bg-[var(--window-c-background)]',
      'transition-colors',
      'duration-300'
    )
  }, [windowInit])

  return (
    <WindowContext.Provider value={{ titlebar, window: initProps }}>
      {/*<TitlebarContextProvider>
        <Titlebar />
      </TitlebarContextProvider>*/}
      <div className="window-content flex-1 overflow-y-auto overflow-x-hidden relative [&>div:last-child]:h-full [scrollbar-width:thin] [scrollbar-color:var(--window-c-scrollbar-thumb)_var(--window-c-scrollbar-track)] [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-[var(--window-c-scrollbar-track)] [&::-webkit-scrollbar-thumb]:bg-[var(--window-c-scrollbar-thumb)] [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:border-[3px] [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-[var(--window-c-scrollbar-track)] [&::-webkit-scrollbar-thumb:hover]:bg-[var(--window-c-scrollbar-thumb-hover)]">
        {children}
      </div>
    </WindowContext.Provider>
  )
}

export const useWindowContext = () => {
  const context = useContext(WindowContext)
  if (!context) {
    throw new Error('useWindowContext must be used within a WindowContextProvider')
  }
  return context
}
