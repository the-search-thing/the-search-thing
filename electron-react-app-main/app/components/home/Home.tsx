import { useEffect, useState } from 'react'
import {Searchbar} from '../ui/searchbar'
import { Badge } from '../ui/badge'
import './styles.css'

export default function Home() {
  const [q, setQ] = useState("")

  return (
    <div className="welcome-content flex flex-col gap-5">
      <div className="flex items-center h-[20%]">
        <Searchbar
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
        />
      </div>
      <div className="flex justify-center items-center gap-4 opacity-50 hover:opacity-80 transition-opacity">
        <DarkModeToggle />
      </div>
    </div>
  )
}

const DarkModeToggle = () => {
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    setIsDarkMode(document.documentElement.classList.contains('dark'))
  }, [])

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark')
    setIsDarkMode(!isDarkMode)
  }

  return (
    <div className="flex justify-center items-center gap-2 text-sm cursor-pointer">
      <Badge variant="secondary" onClick={toggleDarkMode}>
        {isDarkMode ? 'Dark Mode' : 'Light Mode'}
      </Badge>
    </div>
  )
}
