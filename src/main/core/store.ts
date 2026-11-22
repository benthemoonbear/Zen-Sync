import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Small JSON file store. Writes go through a temp file + rename so a crash can't corrupt it. */
export function createStore<T>(file: string, defaults: T): { get(): T; set(v: T): void } {
  return {
    get(): T {
      try {
        return JSON.parse(readFileSync(file, 'utf8')) as T
      } catch {
        return defaults
      }
    },
    set(v: T): void {
      mkdirSync(dirname(file), { recursive: true })
      const tmp = `${file}.tmp-${process.pid}`
      writeFileSync(tmp, JSON.stringify(v))
      renameSync(tmp, file)
    }
  }
}
