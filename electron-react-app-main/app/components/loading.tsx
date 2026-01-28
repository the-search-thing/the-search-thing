import { useEffect, useState } from 'react'
import { useConveyor } from '@/app/hooks/use-conveyor'
import './home/styles.css'

interface LoadingProps {
  onIndexComplete?: (isIndexed: boolean) => void
}

export default function Loading({ onIndexComplete }: LoadingProps) {
  const search = useConveyor("search")
  const [isChecking, setIsChecking] = useState<boolean>(true)
  
  const handleCheck = async () => {
    setIsChecking(true)
    try {
      const checkRes = await search.check()
      onIndexComplete?.(checkRes)
    } catch (error) {
      console.error('Error checking index:', error)
      onIndexComplete?.(false)
    } finally {
      setIsChecking(false)
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
        <p className="loading-text">
          Please wait while we check if your files are indexed
        </p>
      </div>
    </div>
  )
}
