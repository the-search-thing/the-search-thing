import { useState } from 'react'
import { Searchbar } from '../ui/searchbar'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { Button } from '../ui/button'
import Loading from '../loading'
import { cn } from '@/lib/utils'
import './styles.css'

export default function Home() {
  const [query, setQuery] = useState("")
  const search = useConveyor("search")
  const [results, setResults] = useState<string[]>([])
  const [isIndexed, setIsIndexed] = useState<boolean | null>(null)
  const [isIndexing, setIsIndexing] = useState<boolean>(false)
  
  const handleSearch = async () => {
    const res = await search.search(query)
    setResults(res.results)
  }

  const handleIndexComplete = (indexed: boolean) => {
    setIsIndexed(indexed)
  }

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

  // Show loading while checking index
  if (isIndexed === null) {
    return <Loading onIndexComplete={handleIndexComplete} />
  }

  // Show scan prompt if not indexed
  if (isIndexed) {
    return (
      <div className="welcome-content flex flex-col gap-5 items-center justify-center min-h-[400px]">
        <div className="loading-container">
          {isIndexing ? (
            <>
              <div className="spinner"></div>
              <h2 className="loading-title">Indexing Files...</h2>
              <p className="loading-text">
                Please wait while we scan and index your files. This may take a few moments.
              </p>
            </>
          ) : (
            <>
              <h2>No Index Found</h2>
              <p>Scan your folders to enable search functionality.</p>
              <Button onClick={handleStartIndexing} className="mt-4">
                Start Scanning
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  // Show searchbar if indexed
  return (
    <div className="welcome-content flex flex-col gap-5">
      <div className="flex items-center h-[20%]">
        <Searchbar
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for files or folders…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSearch()
            }
          }}
        />
      </div>
      
      <div className={cn(
        "flex items-center",
        "h-full",
        "border border-zinc-800/80 bg-zinc-950/60",
        "px-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]",
        "focus-within:border-zinc-700 focus-within:ring-2 focus-within:ring-zinc-700/40",
      )}>
        Results here
      </div>
      
      {/*{results.length > 0 && (
        <div className="results-container">
          {results.map((result, idx) => (
            <div key={idx} className="result-item">
              {result}
            </div>
          ))}
        </div>
      )}*/}
    </div>
  )
}
