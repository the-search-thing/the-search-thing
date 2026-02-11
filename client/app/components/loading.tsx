import { useEffect } from 'react'
import { useConveyor } from '@/app/hooks/use-conveyor'
import '../home/styles.css'
import { useAppContext } from '../AppContext'

interface LoadingProps {
  onIndexComplete?: () => void
}

export default function Loading({ onIndexComplete }: LoadingProps) {
  const search = useConveyor('search')
  const { setIsIndexed } = useAppContext()

  const handleCheck = async () => {
    try {
      const checkRes = await search.check()
      setIsIndexed(checkRes.success) // update the global state
      onIndexComplete?.()
    } catch (error) {
      console.error('Error checking index:', error)
      setIsIndexed(false)
      onIndexComplete?.()
    }
  }

  useEffect(() => {
    handleCheck()
  }, [])

  return (
    <div className="welcome-content flex flex-col gap-5 items-center justify-center min-h-[400px]">
      <div className="loading-container">
        <div className="spinner"></div>
        <h2 className="loading-title">Checking Index...</h2>
        <p className="loading-text">Please wait while we check if your files are indexed</p>
      </div>
    </div>
  )
}
