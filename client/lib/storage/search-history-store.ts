import type { SqliteAdapter } from './sqlite-adapter'

export type SearchHistoryInsert = {
  search_string: string
  timestamp?: number
  file_types?: string[]
  filters?: Record<string, unknown>
  path_scope?: string
}

export type SearchHistoryEntry = {
  id: number
  search_string: string
  timestamp: number
  file_types: string[] | null
  filters: Record<string, unknown> | null
  path_scope: string | null
}

type SearchHistoryRow = {
  id: number
  search_string: string
  timestamp: number
  file_types: string | null
  filters: string | null
  path_scope: string | null
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  search_string TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  file_types TEXT,
  filters TEXT,
  path_scope TEXT
);
CREATE INDEX IF NOT EXISTS idx_search_history_timestamp ON search_history(timestamp DESC);
`

const parseJson = <T>(value: string | null): T | null => {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

const toJson = (value: unknown | undefined) => {
  if (value === undefined) {
    return null
  }

  return JSON.stringify(value)
}

export const createSearchHistoryStore = (adapter: SqliteAdapter) => {
  const init = () => {
    adapter.exec(schemaSql)
  }

  const addSearch = (input: SearchHistoryInsert) => {
    const timestamp = input.timestamp ?? Date.now()
    const result = adapter.run(
      `INSERT INTO search_history (search_string, timestamp, file_types, filters, path_scope)
       VALUES (?, ?, ?, ?, ?)`,
      [
        input.search_string,
        timestamp,
        toJson(input.file_types),
        toJson(input.filters),
        input.path_scope ?? null,
      ]
    )

    return Number(result.lastInsertRowid)
  }

  const getRecentSearches = (limit = 20): SearchHistoryEntry[] => {
    const safeLimit = Math.max(1, Math.floor(limit))
    const rows = adapter.all<SearchHistoryRow>(
      `SELECT id, search_string, timestamp, file_types, filters, path_scope
       FROM search_history
       ORDER BY timestamp DESC
       LIMIT ?`,
      [safeLimit]
    )

    return rows.map((row) => ({
      id: row.id,
      search_string: row.search_string,
      timestamp: row.timestamp,
      file_types: parseJson<string[]>(row.file_types),
      filters: parseJson<Record<string, unknown>>(row.filters),
      path_scope: row.path_scope,
    }))
  }

  const pruneHistory = (maxItems: number) => {
    const safeLimit = Math.max(0, Math.floor(maxItems))
    const result = adapter.run(
      `DELETE FROM search_history
       WHERE id NOT IN (
         SELECT id FROM search_history
         ORDER BY timestamp DESC
         LIMIT ?
       )`,
      [safeLimit]
    )

    return result.changes
  }

  return {
    init,
    addSearch,
    getRecentSearches,
    pruneHistory,
    close: () => adapter.close(),
  }
}
