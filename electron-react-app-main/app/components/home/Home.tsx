import { useState } from 'react'
import { Searchbar } from '../ui/searchbar'
import { useConveyor } from '@/app/hooks/use-conveyor'
import Loading from '../loading'
import { cn } from '@/lib/utils'
import './styles.css'
import Results from '../Results'
import Footer from '../Footer'
import { SearchResponse } from '../types/types'

export default function Home() {
  const [query, setQuery] = useState('')
  const search = useConveyor('search')
  const [searchResults, setSearchResults] = useState<SearchResponse>()
  const [isCheckingIndex, setIsCheckingIndex] = useState(true)
  const [hasSearched, setHasSearched] = useState(false) //temporary logic (pls remove in the future :pray:)

  const handleSearch = async () => {
    setHasSearched(true)
    const res = await search.search(query)
    setSearchResults(res)
  }

  // Show loading while checking index
  if (isCheckingIndex) {
    return <Loading onIndexComplete={() => setIsCheckingIndex(false)} />
  }

  return (
    <div className="welcome-content flex flex-col gap-5 h-screen">
      <div className="flex items-center flex-none min-h-[55px]">
        <Searchbar
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setHasSearched(false)
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
        <Results searchResults={searchResults} query={query} hasSearched={hasSearched} />
      </div>

      <div
        className={cn(
          'flex items-center flex-none min-h-[56px]',
          ' bg-zinc-800/60',
          'px-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
        )}
      >
        <Footer />
      </div>
    </div>
  )
}
