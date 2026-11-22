import { describe, expect, test } from 'vitest'
import { join } from 'node:path'
import { createHandlers } from '../../src/main/ipc'
import { FakeEmbedder } from '../fakes/fakeEmbedder'
import { tempDir, writeJpeg } from '../helpers/jpeg'
import { DEFAULT_PARTS } from '../../src/main/core/parts'

async function setup(n = 3) {
  const userData = await tempDir('userdata')
  const dir = await tempDir('wedding')
  for (let i = 1; i <= n; i++) await writeJpeg(dir, `IMG${String(i).padStart(4, '0')}.jpg`)
  const events: [string, unknown][] = []
  const h = createHandlers({
    userData,
    createEmbedder: async () => new FakeEmbedder({ 'IMG0001.jpg': [1, 2, 3, 4] }),
    chooseFolder: async () => dir,
    openExternal: async () => {},
    showItemInFolder: () => {},
    fetch: globalThis.fetch,
    instanceName: 'test',
    productId: 1,
    buyUrl: 'https://example.com/buy',
    emit: (c, p) => events.push([c, p])
  })
  return { h, dir, userData, events }
}

describe('ipc handlers', () => {
  test('save returns blocked for 251 photos when unlicensed', async () => {
    const { h, dir } = await setup(251)
    const r = await h.sort(dir)
    expect(r.photos).toHaveLength(251)
    const res = await h.save({ dir, photos: r.photos, parts: r.parts, mode: 'single', overwrite: false })
    expect(res).toEqual({ blocked: 'limit' })
  }, 60_000)

  test('save writes copies when allowed', async () => {
    const { h, dir } = await setup(3)
    const r = await h.sort(dir)
    expect(await h.save({ dir, photos: r.photos, parts: r.parts, mode: 'single', overwrite: false })).toEqual({ written: 3, outDir: join(dir, 'numbered') })
  })

  test('save refuses photos that were not in the last sort', async () => {
    const { h, dir } = await setup(2)
    const r = await h.sort(dir)
    const evil = [...r.photos, { ...r.photos[0], path: '/etc/passwd', name: 'passwd' }]
    await expect(h.save({ dir, photos: evil, parts: r.parts, mode: 'single', overwrite: false })).rejects.toThrow()
  })

  test('recordCorrection stores the embedding from the last sort', async () => {
    const { h, dir } = await setup(2)
    await h.sort(dir)
    await h.recordCorrection(join(dir, 'IMG0001.jpg'), 'ceremony')
    const saved = h.corrections()
    expect(saved).toHaveLength(1)
    expect(saved[0].partId).toBe('ceremony')
    expect(saved[0].emb[0]).toBeCloseTo(1 / Math.sqrt(30), 5)
  })

  test('parts default and persist', async () => {
    const { h } = await setup(1)
    expect((await h.getParts()).map((p) => p.id)).toEqual(DEFAULT_PARTS.map((p) => p.id))
    await h.setParts(DEFAULT_PARTS.slice(0, 3))
    expect(await h.getParts()).toHaveLength(3)
  })

  test('only paths from the last sort are allowed for thumbnails', async () => {
    const { h, dir } = await setup(1)
    expect(h.isAllowedPath(join(dir, 'IMG0001.jpg'))).toBe(false)
    await h.sort(dir)
    expect(h.isAllowedPath(join(dir, 'IMG0001.jpg'))).toBe(true)
    expect(h.isAllowedPath('/etc/passwd')).toBe(false)
  })

  test('licence starts unlicensed', async () => {
    const { h } = await setup(1)
    expect(await h.licence()).toEqual({ licensed: false })
  })
})
