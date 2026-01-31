import { useState } from "react"
import { Button } from "./ui/button"
import { useConveyor } from "../hooks/use-conveyor"

export default function NoIndex() {
  const search = useConveyor("search")
  const [isIndexing, setIsIndexing] = useState<boolean>(false)
  const [isIndexed, setIsIndexed] = useState<boolean | null>(null)
  
  const handleStartIndexing = async () => {
    const res = await search.openFileDialog()
    
    if (!res || res.length === 0) return //check to prevent indexing null 
    
    setIsIndexing(true)
    try {
      const indexRes = await search.index(res)
      if (indexRes) {
        setIsIndexed(true)
      }
    } catch (error) {
      console.error('Error indexing files:', error)
    } finally {
      setIsIndexing(false)
    }
  }
  
  return (
    <div className="welcome-content flex flex-col gap-5 items-center justify-center min-h-[400px]">
      <div className="loading-container">
        <h2>No Index Found</h2>
        <p>Scan your folders to enable search functionality.</p>
        <Button onClick={handleStartIndexing} className="mt-4">
          Start Scanning
        </Button>
      </div>
    </div>
  )
}