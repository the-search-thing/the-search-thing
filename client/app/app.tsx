import Home from '@/app/components/home/Home'
import './styles/app.css'
import { AppProvider } from './components/AppContext'

export default function App() {
  return (
    <AppProvider>
      <Home />
    </AppProvider>
  )
}
