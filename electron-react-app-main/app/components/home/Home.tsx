import { useState } from 'react'
import { Searchbar } from '../ui/searchbar'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { Button } from '../ui/button'
import Loading from '../loading'
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
    setIsIndexing(true)
    try {
      const indexRes = await search.index()
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
  if (!isIndexed) {
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
              <p>Scan your files to enable search functionality.</p>
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
          placeholder="Search…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSearch()
            }
          }}
        />
      </div>
      
      {results.length > 0 && (
        <div className="results-container">
          {results.map((result, idx) => (
            <div key={idx} className="result-item">
              {result}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
