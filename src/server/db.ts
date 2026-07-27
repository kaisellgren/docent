import { createPool, sql, type DatabasePool } from 'slonik';
import { env } from './env';

let pool: DatabasePool | undefined;

export function db(): DatabasePool {
  pool ??= createPool(env().DATABASE_URL, { maximumPoolSize: 10 });
  return pool;
}

export { sql };
