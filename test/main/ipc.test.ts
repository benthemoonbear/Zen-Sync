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
    serverUrl: '',
    checkoutUrl: '',
    openCheckout: async () => null,
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

  test('event types: switching changes the parts, and each keeps its own edits', async () => {
    const { h } = await setup(1)
    const ev = await h.getEvents()
    expect(ev.current).toBe('wedding')
    expect(ev.events.map((e) => e.id)).toContain('corporate')
    await h.setParts(DEFAULT_PARTS.slice(0, 2))
    await h.setEvent('corporate')
    expect((await h.getEvents()).current).toBe('corporate')
    expect((await h.getParts())[0].name).toBe('Arrival and registration')
    await h.setEvent('wedding')
    expect(await h.getParts()).toHaveLength(2)
    await h.setParts([])
    expect(await h.getParts()).toHaveLength(DEFAULT_PARTS.length)
  })

  test('an unknown event type is ignored', async () => {
    const { h } = await setup(1)
    await h.setEvent('nonsense')
    expect((await h.getEvents()).current).toBe('wedding')
  })

  test('wedding parts saved by an older version are kept', async () => {
    const { h, userData } = await setup(1)
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(userData, 'parts.json'), JSON.stringify(DEFAULT_PARTS.slice(0, 4)))
    expect(await h.getParts()).toHaveLength(4)
  })

  test('sorting uses the chosen event and gives added parts prompts from their names', async () => {
    const { h, dir } = await setup(2)
    await h.setEvent('party')
    await h.setParts([{ id: 'x', name: 'Fireworks', prompts: [] }, { id: 'y', name: 'Cake', prompts: ['a cake'] }])
    const r = await h.sort(dir)
    expect(r.parts.map((p) => p.prompts[0])).toEqual(['a photo of fireworks', 'a cake'])
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

test('a failed model download is reported as such and can be retried', async () => {
  const userData = await tempDir('userdata')
  const dir = await tempDir('wedding')
  await writeJpeg(dir, 'IMG0001.jpg')
  let calls = 0
  const h = createHandlers({
    userData,
    createEmbedder: async () => {
      calls++
      if (calls === 1) throw new TypeError('fetch failed')
      return new FakeEmbedder({})
    },
    chooseFolder: async () => dir, openExternal: async () => {}, showItemInFolder: () => {},
    fetch: globalThis.fetch, instanceName: 't', serverUrl: '', checkoutUrl: '', openCheckout: async () => null, emit: () => {}
  })
  await expect(h.sort(dir)).rejects.toThrow('MODEL_DOWNLOAD_FAILED')
  expect((await h.sort(dir)).photos).toHaveLength(1)
})


describe('buying inside the app', () => {
  async function buySetup(openCheckout: (url: string, successPrefix: string) => Promise<string | null>) {
    const userData = await tempDir('userdata')
    const calls: string[] = []
    const fetch = (async (url: string) => {
      calls.push(url)
      if (url.includes('/claim')) return new Response(JSON.stringify({ ready: true, key: 'ZS-AAAA-BBBB-CCCC-DDDD', customerName: 'Jane Smith' }))
      return new Response(JSON.stringify({ ok: true, key: 'ZS-AAAA-BBBB-CCCC-DDDD', instanceId: 'inst-1', customerName: 'Jane Smith' }))
    }) as never
    const opened: [string, string][] = []
    const h = createHandlers({
      userData,
      createEmbedder: async () => new FakeEmbedder({}),
      chooseFolder: async () => null, openExternal: async () => {}, showItemInFolder: () => {},
      fetch, instanceName: 'Ben PC',
      serverUrl: 'https://licences.example',
      checkoutUrl: 'https://buy.stripe.com/test_abc',
      openCheckout: async (url, prefix) => {
        opened.push([url, prefix])
        return openCheckout(url, prefix)
      },
      emit: () => {}
    })
    return { h, calls, opened }
  }

  test('a completed checkout unlocks the app with no key to type', async () => {
    const { h, opened } = await buySetup(async () => 'cs_test_42')
    expect(await h.buy()).toEqual({ ok: true, customerName: 'Jane Smith' })
    expect(opened[0]).toEqual(['https://buy.stripe.com/test_abc', 'https://licences.example/success'])
    expect(await h.licence()).toEqual({ licensed: true, customerName: 'Jane Smith', key: 'ZS-AAAA-BBBB-CCCC-DDDD' })
  })

  test('closing the checkout window leaves the app as it was', async () => {
    const { h, calls } = await buySetup(async () => null)
    expect(await h.buy()).toEqual({ ok: false, cancelled: true })
    expect(calls).toEqual([])
    expect(await h.licence()).toEqual({ licensed: false })
  })

  test('a build without payments set up says so', async () => {
    const userData = await tempDir('userdata')
    const h = createHandlers({
      userData, createEmbedder: async () => new FakeEmbedder({}), chooseFolder: async () => null,
      openExternal: async () => {}, showItemInFolder: () => {}, fetch: globalThis.fetch, instanceName: 'x',
      serverUrl: '', checkoutUrl: '', openCheckout: async () => 'cs_test_1', emit: () => {}
    })
    expect(await h.buy()).toEqual({ ok: false, message: "This copy of the app isn't set up for purchases yet. Contact support." })
  })
})
