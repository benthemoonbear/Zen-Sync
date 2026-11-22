import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** Minimal stand-in for Cloudflare D1 backed by node:sqlite, with the real schema. */
export function fakeD1() {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(join(import.meta.dirname, '../schema.sql'), 'utf8'))
  const statement = (sql: string, params: unknown[] = []) => ({
    bind: (...p: unknown[]) => statement(sql, p),
    first: async <T>() => (db.prepare(sql).get(...(params as never[])) as T) ?? null,
    all: async <T>() => ({ results: db.prepare(sql).all(...(params as never[])) as T[] }),
    run: async () => {
      const r = db.prepare(sql).run(...(params as never[]))
      return { meta: { changes: Number(r.changes) } }
    }
  })
  return { prepare: (sql: string) => statement(sql), raw: db }
}
