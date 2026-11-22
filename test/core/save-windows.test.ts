import { afterEach, expect, test, vi } from 'vitest'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fsOps, planOutput, writeCopies } from '../../src/main/core/save'
import { tempDir, writeJpeg } from '../helpers/jpeg'

afterEach(() => vi.restoreAllMocks())
const parts = [{ id: 'p', name: 'P', prompts: [] }]

async function setup() {
  const dir = await tempDir()
  await writeJpeg(dir, 'A.jpg')
  await mkdir(join(dir, 'numbered'))
  await writeFile(join(dir, 'numbered', 'old.txt'), 'old')
  const plan = planOutput([{ path: join(dir, 'A.jpg'), name: 'A.jpg', cameraId: 'c', partId: 'p', unsure: false }], parts, 'single')
  return { dir, plan }
}
const opts = { overwrite: true, mode: 'single' as const, licensed: false }
const busy = () => Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })

test('replacing numbered/ retries when Windows briefly locks the folder', async () => {
  const { dir, plan } = await setup()
  const real = fsOps.rename
  let failures = 2
  vi.spyOn(fsOps, 'rename').mockImplementation(async (from, to) => {
    if (String(from).includes('numbered.tmp-') && failures-- > 0) throw busy()
    return real(from, to)
  })
  expect(await writeCopies(dir, plan, opts)).toEqual({ written: 1 })
  expect(await readdir(join(dir, 'numbered'))).toEqual(['1.jpg'])
})

test('if the new folder can never be moved in, the old numbered/ is kept', async () => {
  const { dir, plan } = await setup()
  const real = fsOps.rename
  vi.spyOn(fsOps, 'rename').mockImplementation(async (from, to) => {
    if (String(from).includes('numbered.tmp-')) throw busy()
    return real(from, to)
  })
  await expect(writeCopies(dir, plan, opts)).rejects.toThrow()
  expect(await readdir(join(dir, 'numbered'))).toEqual(['old.txt'])
  expect((await readdir(dir)).filter((n) => n.startsWith('numbered.'))).toEqual([])
}, 20_000)
