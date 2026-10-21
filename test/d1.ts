/**
 * Just enough of Cloudflare's D1 for tests, over Node's built-in SQLite: prepare / bind / first / all / run and batch
 * (one transaction, rolled back when a statement fails). The database starts with every migration applied.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

type Value = string | number | null

class Statement {
  constructor(private readonly db: DatabaseSync, readonly sql: string, readonly params: Value[] = []) {}

  bind(...params: unknown[]): Statement {
    return new Statement(this.db, this.sql, params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p as Value)))
  }

  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...this.params) as T | undefined) ?? null
  }

  async all<T>(): Promise<{ results: T[]; meta: { changes: number } }> {
    return this.exec<T>()
  }

  async run(): Promise<{ results: unknown[]; meta: { changes: number } }> {
    return this.exec()
  }

  /** Runs it: rows for a query or a RETURNING, the changed row count otherwise. */
  exec<T>(): { results: T[]; meta: { changes: number } } {
    const statement = this.db.prepare(this.sql)
    if (/^\s*select\b/i.test(this.sql) || /\breturning\b/i.test(this.sql)) {
      const before = Number((this.db.prepare('SELECT total_changes() AS n').get() as { n: number }).n)
      const results = statement.all(...this.params) as T[]
      const after = Number((this.db.prepare('SELECT total_changes() AS n').get() as { n: number }).n)
      return { results, meta: { changes: after - before } }
    }
    const result = statement.run(...this.params)
    return { results: [], meta: { changes: Number(result.changes) } }
  }
}

/** A D1Database over an in-memory SQLite database, with the site's migrations applied. */
export function testD1(): D1Database {
  const db = new DatabaseSync(':memory:')
  const dir = fileURLToPath(new URL('../migrations', import.meta.url).href)
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(join(dir, file), 'utf8'))
  const d1 = {
    prepare: (sql: string) => new Statement(db, sql),
    async batch(statements: Statement[]) {
      db.exec('BEGIN')
      try {
        const results = statements.map((s) => s.exec())
        db.exec('COMMIT')
        return results
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
    async exec(sql: string) {
      db.exec(sql)
      return { count: 0, duration: 0 }
    },
  }
  return d1 as unknown as D1Database
}
