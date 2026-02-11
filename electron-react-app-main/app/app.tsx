import Home from '@/app/home/Home'
import './styles/app.css'
import { AppProvider } from './AppContext'

export default function App() {
  return (
      <AppProvider>
        <Home />
      </AppProvider>
    )
}
