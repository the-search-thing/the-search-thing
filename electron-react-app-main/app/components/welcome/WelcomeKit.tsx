import { useEffect, useState } from 'react'
import { Badge } from '../ui/badge'
import './styles.css'

export default function WelcomeKit() {

  return (
    <div className="welcome-content flex flex-col gap-5">
      <div className="flex gap-5 items-center">
        Search bar goes here
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
