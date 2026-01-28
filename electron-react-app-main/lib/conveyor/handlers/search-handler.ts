import { handle } from '@/lib/main/shared'

export const registerSearchHandlers = () => {
  handle('search', async (query: string) => {
     // Your logic here (e.g., call backend, process data)
     const results = await mySearchFunction(query)
     return { results }
   })
}
