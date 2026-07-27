import { createPool, sql, type DatabasePool } from 'slonik';
import { env } from './env';

let pool: Promise<DatabasePool> | undefined;

export function db(): Promise<DatabasePool> {
  pool ??= createPool(env().DATABASE_URL, { maximumPoolSize: 10 });
  return pool;
}

export { sql };
