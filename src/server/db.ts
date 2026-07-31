import { createPool, sql, type DatabasePool } from 'slonik'
import { env } from './env'

let pool: Promise<DatabasePool> | undefined

export function db(): Promise<DatabasePool> {
  pool ??= createPool(env().DATABASE_URL, { maximumPoolSize: 10 })
  return pool
}

export async function closeDb(): Promise<void> {
  if (!pool) return
  const databasePool = await pool
  pool = undefined
  await databasePool.end()
}

export { sql }
