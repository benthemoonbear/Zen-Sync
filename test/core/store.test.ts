import { expect, test } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createStore } from '../../src/main/core/store'
import { tempDir } from '../helpers/jpeg'

test('store returns defaults when file missing', async () => {
  const dir = await tempDir()
  expect(createStore(join(dir, 'missing.json'), { a: 1 }).get()).toEqual({ a: 1 })
})

test('store returns defaults when file is corrupt', async () => {
  const dir = await tempDir()
  await writeFile(join(dir, 'bad.json'), '{not json')
  expect(createStore(join(dir, 'bad.json'), { a: 1 }).get()).toEqual({ a: 1 })
})

test('store round-trips a value', async () => {
  const dir = await tempDir()
  const file = join(dir, 'nested', 'v.json')
  createStore(file, { a: 1 }).set({ a: 42 })
  expect(createStore(file, { a: 1 }).get()).toEqual({ a: 42 })
})
