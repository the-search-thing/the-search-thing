import { useState } from 'react'
import { Searchbar } from '../ui/searchbar'
import { useConveyor } from '@/app/hooks/use-conveyor'
import Loading from '../loading'
import { cn } from '@/lib/utils'
import './styles.css'
import NoIndex from '../NoIndex'
import Results from '../Results'
import Footer from '../Footer'
import { useAppContext } from '../AppContext'

export default function Home() {
  const [query, setQuery] = useState("")
  const search = useConveyor("search")
  const [results, setResults] = useState<string[]>([])
  const [isCheckingIndex, setIsCheckingIndex] = useState(true)
  
  const { isIndexed } = useAppContext() // Read global state
  
  const handleSearch = async () => {
    const res = await search.search(query)
    setResults(res.results)
  }

  // Show loading while checking index
  if (isCheckingIndex) {
    return <Loading onIndexComplete={() => setIsCheckingIndex(false)} />
  }

  return (
    <div className="welcome-content flex flex-col gap-5">
      <div className="flex items-center basis-[15%]">
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
        "basis-[75%]",
        "border-2 border-zinc-700/80 bg-zinc-800/60",
        "px-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]",
      )}>
        {!isIndexed ? (
          <NoIndex />
        ) : (
          <Results results={results} query={query} />
        )}
      </div>
      
      <div className={cn(
        "flex items-center",
        "basis-[10%]",
        "border-2 border-zinc-700/80 bg-zinc-800/60",
        "px-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]",
      )}>
        <Footer />
      </div>
    </div>
  )
}
