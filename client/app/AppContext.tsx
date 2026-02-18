import { createContext, useContext, useState, ReactNode } from 'react'
import { IndexJobStatus } from './types/types'

interface AppContextType {
  isIndexed: boolean
  setIsIndexed: (value: boolean) => void
  awaitingIndexing: boolean
  setAwaitingIndexing: (value: boolean) => void
  currentJobId: string | null
  setCurrentJobId: (id: string | null) => void
  indexingLocation: 'results' | 'footer' | null
  setIndexingLocation: (loc: 'results' | 'footer' | null) => void
  dirIndexed: string | null
  setDirIndexed: (dir: string | null) => void
  jobStatus: IndexJobStatus | null
  setJobStatus: (status: IndexJobStatus | null) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [isIndexed, setIsIndexed] = useState(false)
  const [awaitingIndexing, setAwaitingIndexing] = useState(false)
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [indexingLocation, setIndexingLocation] = useState<'results' | 'footer' | null>(null)
  const [dirIndexed, setDirIndexed] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<IndexJobStatus | null>(null)

  return (
    <AppContext.Provider value={{
      isIndexed, setIsIndexed,
      awaitingIndexing, setAwaitingIndexing,
      currentJobId, setCurrentJobId,
      indexingLocation, setIndexingLocation,
      dirIndexed, setDirIndexed,
      jobStatus, setJobStatus
    }}>
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
