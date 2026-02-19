import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Home from '@/app/home/Home'
import Settings from '@/app/settings/Settings'
import './styles/app.css'
import { AppProvider } from './AppContext'

export default function App() {
  return (
    <AppProvider>
      <MemoryRouter initialEntries={['/']} initialIndex={0}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>
  )
}
