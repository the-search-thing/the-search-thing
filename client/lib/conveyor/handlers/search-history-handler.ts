import { app } from 'electron'
import { join } from 'path'
import { handle } from '@/lib/main/shared'
import { createBetterSqliteAdapter } from '@/lib/storage/sqlite-adapter'
import { createSearchHistoryStore } from '@/lib/storage/search-history-store'

let store: ReturnType<typeof createSearchHistoryStore> | null = null

const getStore = () => {
  if (store) {
    return store
  }

  const dbPath = join(app.getPath('userData'), 'search-history.db')
  const adapter = createBetterSqliteAdapter(dbPath)
  store = createSearchHistoryStore(adapter)
  store.init()

  return store
}

export const registerSearchHistoryHandlers = () => {
  app.on('before-quit', () => {
    store?.close?.()
  })

  handle('search-history/add', async (input) => {
    const id = getStore().addSearch(input)
    return { id }
  })

  handle('search-history/recent', async (limit) => {
    return getStore().getRecentSearches(limit)
  })

  handle('search-history/prune', async (maxItems) => {
    const deleted = getStore().pruneHistory(maxItems)
    return { deleted }
  })
}
