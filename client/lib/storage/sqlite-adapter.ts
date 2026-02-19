import Database from 'better-sqlite3'

export type SqliteParams = unknown[] | Record<string, unknown>

export type SqliteRunResult = {
  changes: number
  lastInsertRowid: number | bigint
}

export type SqliteAdapter = {
  exec: (sql: string) => void
  run: (sql: string, params?: SqliteParams) => SqliteRunResult
  get: <T>(sql: string, params?: SqliteParams) => T | undefined
  all: <T>(sql: string, params?: SqliteParams) => T[]
  close: () => void
}

const runWithParams = (stmt: any, params?: SqliteParams) => {
  if (params === undefined) {
    return stmt.run()
  }

  if (Array.isArray(params)) {
    return stmt.run(...params)
  }

  return stmt.run(params)
}

const getWithParams = (stmt: any, params?: SqliteParams) => {
  if (params === undefined) {
    return stmt.get()
  }

  if (Array.isArray(params)) {
    return stmt.get(...params)
  }

  return stmt.get(params)
}

const allWithParams = (stmt: any, params?: SqliteParams) => {
  if (params === undefined) {
    return stmt.all()
  }

  if (Array.isArray(params)) {
    return stmt.all(...params)
  }

  return stmt.all(params)
}

export const createBetterSqliteAdapter = (dbPath: string): SqliteAdapter => {
  const db = new Database(dbPath)

  return {
    exec: (sql) => db.exec(sql),
    run: (sql, params) => runWithParams(db.prepare(sql), params),
    get: (sql, params) => getWithParams(db.prepare(sql), params),
    all: (sql, params) => allWithParams(db.prepare(sql), params),
    close: () => db.close(),
  }
}
