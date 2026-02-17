import { useState } from 'react'
import { Searchbar } from '../components/ui/searchbar'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { cn } from '@/lib/utils'
import './styles.css'
import Results from '../components/Results'
import Footer from '../components/Footer'
import { SearchResponse } from '../types/types'

export default function Home() {
  const [query, setQuery] = useState('')
  const search = useConveyor('search')
  const [searchResults, setSearchResults] = useState<SearchResponse>()
  const [hasSearched, setHasSearched] = useState(false) //temporary logic (pls remove in the future :pray:)
  const [isLoading, setIsLoading] = useState(false)
  const [awaitingIndexing, setAwaitingIndexing] = useState(false)
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [hasInteracted, setHasInteracted] = useState(false)

  const handleSearch = async () => {
    const lastResultsEmpty = (searchResults?.results?.length ?? 0) === 0
    setHasInteracted(true)

    if (hasSearched && lastResultsEmpty) {
      setAwaitingIndexing(true)
      return
    }

    setIsLoading(true)
    try {
      const res = await search.search(query)
      setSearchResults(res)
      setHasSearched(true)
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="welcome-content flex flex-col gap-5 h-screen">
      <div className="flex items-center flex-none min-h-[55px]">
        <Searchbar
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setHasSearched(false)
            if (!currentJobId) {
              setAwaitingIndexing(false)
              setCurrentJobId(null)
            }
            setHasInteracted(true)
          }}
          placeholder="Search for files or folders…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSearch()
            }
          }}
        />
      </div>

      <div
        className={cn(
          'flex flex-1 min-h-0',
          'border-2 border-zinc-700/80 bg-zinc-800/60',
          'px-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
        )}
      >
        {isLoading ? (
          <div className="flex items-center justify-center w-full text-zinc-400">Searching...</div>
        ) : hasInteracted || awaitingIndexing ? (
          <Results
            searchResults={searchResults}
            query={query}
            hasSearched={hasSearched}
            awaitingIndexing={awaitingIndexing}
            currentJobId={currentJobId}
            setCurrentJobId={setCurrentJobId}
            onIndexingCancelled={() => setAwaitingIndexing(false)}
          />
        ) : (
          <div
            className={cn(
              'flex flex-1 min-h-0 gap-1 flex-col items-center justify-center',
              'border-2 border-zinc-700/80 bg-zinc-800/60',
              'px-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
            )}
          >
            <div className="text-lg">Welcome to the-search-thing!</div>
            <div className="text-sm text-zinc-500">Please start searching to get started...</div>
          </div>
        )}
      </div>

      <div
        className={cn(
          'flex items-center flex-none min-h-[56px]',
          ' bg-zinc-800/60',
          'px-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
        )}
      >
        <Footer
          onIndexStarted={(jobId) => {
            setCurrentJobId(jobId)
            setAwaitingIndexing(true)
            setHasInteracted(true)
          }}
        />
      </div>
    </div>
  )
}
