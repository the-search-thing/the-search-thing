import { useEffect } from 'react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import Home from '@/app/home/Home'
import Settings from '@/app/settings/Settings'
import './styles/app.css'
import { AppProvider } from './AppContext'

function GlobalHotkeys() {
  const navigate = useNavigate()

  useEffect(() => {
    const runAfterRouteChange = (action: () => void) => {
      requestAnimationFrame(() => requestAnimationFrame(action))
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()

      if (event.ctrlKey && key === 'f') {
        event.preventDefault()
        navigate('/')
        runAfterRouteChange(() => {
          const input = document.querySelector<HTMLInputElement>('[data-search-input="true"]')
          if (input) {
            input.focus()
            input.select()
          }
        })
        return
      }

      if (event.altKey && key === 'f') {
        event.preventDefault()
        navigate('/')
        runAfterRouteChange(() => {
          const indexButton = document.querySelector<HTMLButtonElement>('[data-index-button="true"]')
          if (indexButton) {
            indexButton.click()
          }
        })
        return
      }

      if (event.ctrlKey && key === 'b') {
        event.preventDefault()
        navigate('/settings')
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [navigate])

  return null
}

export default function App() {
  return (
    <AppProvider>
      <MemoryRouter initialEntries={['/']} initialIndex={0}>
        <GlobalHotkeys />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>
  )
}
