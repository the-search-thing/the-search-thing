import { createContext, useContext, useState, ReactNode } from 'react'

interface AppContextType {
  isIndexed: boolean
  setIsIndexed: (value: boolean) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [isIndexed, setIsIndexed] = useState(false)

  return (
      <AppContext.Provider value={{ isIndexed, setIsIndexed }}>
        {children}
      </AppContext.Provider>
    )
}

export const useAppContext = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider')
  }
  return context
}
