import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export function openDatabase(filename = process.env.DATABASE_PATH ?? '.local/interactiveworld.db') {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  sqlite.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY)');
  for (const [version, file] of [
    [1, '001_accounts.sql'],
    [2, '002_saved_objects.sql']]) {
    if (sqlite.prepare('SELECT version FROM schema_migrations WHERE version=?').get(version))
      continue;
    sqlite.exec('BEGIN');
    try {
      sqlite.exec(readFileSync(new URL('./migrations/' + file, import.meta.url), 'utf8'));
      sqlite.prepare('INSERT INTO schema_migrations VALUES(?)').run(version);
      sqlite.exec('COMMIT');
    } catch (e) {
      sqlite.exec('ROLLBACK');
      throw e;
    }
  }
  const db = drizzle(async (sql, params, method) => {
    const statement = sqlite.prepare(sql);
    statement.setReturnArrays(true);
    if (method === 'run') {
      statement.run(...params);
      return { rows: [] };
    }
    return { rows: method === 'get' ? statement.get(...params) : statement.all(...params) };
  });
  return { db, close: () => sqlite.close() };
}
