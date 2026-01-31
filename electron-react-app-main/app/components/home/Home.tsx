import { useState } from 'react'
import { Searchbar } from '../ui/searchbar'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { Button } from '../ui/button'
import Loading from '../loading'
import { cn } from '@/lib/utils'
import './styles.css'
import NoIndex from '../NoIndex'
import Results from '../Results'

export default function Home() {
  const [query, setQuery] = useState("")
  const search = useConveyor("search")
  const [results, setResults] = useState<string[]>([])
  const [isIndexed, setIsIndexed] = useState<boolean | null>(null)
  
  const handleSearch = async () => {
    const res = await search.search(query)
    setResults(res.results)
  }

  const handleIndexComplete = (indexed: boolean) => {
    setIsIndexed(indexed)
  }

  // Show loading while checking index
  if (isIndexed === null) {
    return <Loading onIndexComplete={handleIndexComplete} />
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
        "border-2 border-zinc-700/80 bg-zinc-800/60",
        "px-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]",
      )}>
        {!isIndexed ? (
          <NoIndex />
        ) : (
            <Results results={results}  query={query} />
        )}
      </div>
    </div>
  )
}
