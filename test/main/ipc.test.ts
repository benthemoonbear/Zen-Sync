import { describe, expect, test, vi } from 'vitest'
import { join } from 'node:path'
import { createHandlers } from '../../src/main/ipc'
import { FakeEmbedder } from '../fakes/fakeEmbedder'
import { tempDir, writeJpeg } from '../helpers/jpeg'
import { DEFAULT_PARTS } from '../../src/main/core/parts'

async function setup(n = 3, extra: Partial<Parameters<typeof createHandlers>[0]> = {}) {
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
    emit: (c, p) => events.push([c, p]),
    ...extra
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

  test('keeping a job in sync: late photos are added and the numbered copies renumbered', async () => {
    const { h, dir, events } = await setup(3)
    const r = await h.sort(dir)
    await h.save({ dir, photos: r.photos, parts: r.parts, mode: 'single', overwrite: false, keepInSync: true })
    expect((await h.syncedJobs()).map((j) => j.dir)).toEqual([dir])
    expect(await h.syncJob(dir)).toEqual({ added: 0, removed: 0 })
    await writeJpeg(dir, 'IMG0004.jpg')
    await writeJpeg(dir, 'IMG0005.jpg')
    expect(await h.syncJob(dir)).toEqual({ added: 2, removed: 0 })
    const { readdir } = await import('node:fs/promises')
    expect((await readdir(join(dir, 'numbered'))).sort()).toEqual(['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg'])
    expect(events.some(([c, p]) => c === 'job-synced' && (p as { added: number }).added === 2)).toBe(true)
    expect((await h.syncedJobs())[0].photos).toBe(5)
  })

  test('a photo deleted from a synced job is removed from the numbered copies too', async () => {
    const { h, dir } = await setup(3)
    const r = await h.sort(dir)
    await h.save({ dir, photos: r.photos, parts: r.parts, mode: 'single', overwrite: false, keepInSync: true })
    await h.syncJob(dir) // let the catch-up sync after saving finish
    const { rm, readdir } = await import('node:fs/promises')
    await rm(join(dir, 'IMG0002.jpg'))
    expect(await h.syncJob(dir)).toEqual({ added: 0, removed: 1 })
    expect((await readdir(join(dir, 'numbered'))).sort()).toEqual(['1.jpg', '2.jpg'])
  })

  test('a save without keeping in sync is not synced, and a job can stop syncing', async () => {
    const { h, dir } = await setup(2)
    const r = await h.sort(dir)
    await h.save({ dir, photos: r.photos, parts: r.parts, mode: 'single', overwrite: false })
    expect(await h.syncedJobs()).toEqual([])
    await h.save({ dir, photos: r.photos, parts: r.parts, mode: 'single', overwrite: true, keepInSync: true })
    await h.stopSyncing(dir)
    expect(await h.syncedJobs()).toEqual([])
    expect(await h.syncJob(dir)).toEqual({ added: 0, removed: 0 })
  })

  test('the free limit still applies to late photos', async () => {
    const { h, dir, events } = await setup(250)
    const r = await h.sort(dir)
    await h.save({ dir, photos: r.photos, parts: r.parts, mode: 'single', overwrite: false, keepInSync: true })
    await writeJpeg(dir, 'IMG9999.jpg')
    expect(await h.syncJob(dir)).toEqual({ added: 0, removed: 0, blocked: 'limit' })
    expect(events.some(([c, p]) => c === 'job-synced' && (p as { blocked?: string }).blocked === 'limit')).toBe(true)
  }, 60_000)

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

  test('corrections learned with the old photo model are not used with SigLIP 2', async () => {
    const { h, userData } = await setup(1)
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(userData, 'corrections.json'), JSON.stringify([{ partId: 'cake', emb: [1, 0] }]))
    expect(h.corrections()).toHaveLength(0)
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
    expect(ev.current).toBe('auto')
    expect(ev.events.map((e) => e.id)).toContain('corporate')
    await h.setEvent('wedding')
    await h.setParts(DEFAULT_PARTS.slice(0, 2))
    await h.setEvent('corporate')
    expect((await h.getEvents()).current).toBe('corporate')
    expect((await h.getParts())[0].name).toBe('Arrival and registration')
    await h.setEvent('wedding')
    expect(await h.getParts()).toHaveLength(2)
    await h.setParts([])
    expect(await h.getParts()).toHaveLength(DEFAULT_PARTS.length)
  })

  test('Lightroom: not offered where Lightroom Classic does not run', async () => {
    const { h } = await setup(1)
    expect(await h.lightroomStatus()).toEqual({ supported: false, installed: false })
  })

  test('Lightroom: adds Zen Sync to the After Export menu, creating the folder if needed', async () => {
    const root = await tempDir('appdata')
    const actions = join(root, 'Adobe', 'Lightroom', 'Export Actions')
    const { writeFile } = await import('node:fs/promises')
    const install = vi.fn(async (file: string) => writeFile(file, 'link'))
    const { h } = await setup(1, { lightroom: { actionsDir: actions, fileName: 'Zen Sync.lnk', install } })
    expect(await h.lightroomStatus()).toEqual({ supported: true, installed: false })
    expect(await h.addToLightroom()).toEqual({ ok: true })
    expect(install).toHaveBeenCalledWith(join(actions, 'Zen Sync.lnk'))
    expect(await h.lightroomStatus()).toEqual({ supported: true, installed: true })
  })

  test('Lightroom: a failure to add is reported, not thrown', async () => {
    const root = await tempDir('appdata')
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(root, 'a-file'), 'x')
    const { h } = await setup(1, {
      lightroom: { actionsDir: join(root, 'a-file', 'Export Actions'), fileName: 'Zen Sync.lnk', install: async () => {} }
    })
    const r = await h.addToLightroom()
    expect(r.ok).toBe(false)
  })

  test('a folder Lightroom sent before the window was ready is handed over once', async () => {
    let pending: { dir: string; photos: string[] } | null = { dir: '/x/export', photos: [] }
    const { h } = await setup(1, { takeLaunchFolder: () => { const p = pending; pending = null; return p } })
    expect(await h.takeLaunchFolder()).toEqual({ dir: '/x/export', photos: [] })
    expect(await h.takeLaunchFolder()).toBeNull()
  })

  test('sorting only the photos an editor sent, not everything else in that folder', async () => {
    const { h, dir } = await setup(4)
    const r = await h.sort(dir, [join(dir, 'IMG0002.jpg'), join(dir, 'IMG0003.jpg')])
    expect(r.photos.map((p) => p.name).sort()).toEqual(['IMG0002.jpg', 'IMG0003.jpg'])
  })

  test('photos outside the folder are ignored when sorting only some', async () => {
    const { h, dir } = await setup(2)
    const r = await h.sort(dir, ['/etc/passwd', join(dir, 'IMG0001.jpg')])
    expect(r.photos.map((p) => p.name)).toEqual(['IMG0001.jpg'])
  })

  test('a watch folder is chosen, remembered and cleared, and the app is told each time', async () => {
    const changes: (string | null)[] = []
    const { h, dir } = await setup(1, { watchFolderChanged: (d) => changes.push(d) })
    expect(await h.getWatchFolder()).toBeNull()
    expect(await h.chooseWatchFolder()).toBe(dir)
    expect(await h.getWatchFolder()).toBe(dir)
    await h.clearWatchFolder()
    expect(await h.getWatchFolder()).toBeNull()
    expect(changes).toEqual([dir, null])
  })

  test('the app can tell you where Zen Sync is installed, for editors that ask you to browse to it', async () => {
    const { h } = await setup(1, { appLocation: '/opt/Zen Sync/Zen-Sync.AppImage' })
    expect(await h.appLocation()).toBe('/opt/Zen Sync/Zen-Sync.AppImage')
  })

  test('custom keyboard shortcuts are saved and loaded', async () => {
    const { h } = await setup(1)
    expect(await h.getShortcuts()).toEqual({})
    await h.setShortcuts({ next: 'D', prev: 'A' })
    expect(await h.getShortcuts()).toEqual({ next: 'D', prev: 'A' })
  })

  test('saved shortcuts only keep text values', async () => {
    const { h } = await setup(1)
    await h.setShortcuts({ next: 'D', bad: 5 } as unknown as Record<string, string>)
    expect(await h.getShortcuts()).toEqual({ next: 'D' })
  })

  test('an unknown event type is ignored', async () => {
    const { h } = await setup(1)
    await h.setEvent('nonsense')
    expect((await h.getEvents()).current).toBe('auto')
  })

  test('Automatic: the event type is detected from the photos, and can be switched without re-reading them', async () => {
    const { h, dir } = await setup(3)
    const r = await h.sort(dir)
    expect(r.event?.detected).toBe(true)
    expect(r.event?.id).toBeTruthy()
    const again = await h.resortAs('corporate')
    expect(again.event).toEqual({ id: 'corporate', name: 'Corporate event', detected: false })
    expect(again.parts[0].name).toBe('Arrival and registration')
    expect(again.photos).toHaveLength(3)
  })

  test('your own event types: create, edit their parts, rename and delete', async () => {
    const { h } = await setup(1)
    const id = await h.createEvent('Bar mitzvah')
    const ev = await h.getEvents()
    expect(ev.events.find((e) => e.id === id)).toEqual({ id, name: 'Bar mitzvah', custom: true })
    expect((await h.getParts(id)).length).toBeGreaterThan(2)
    await h.setParts([{ id: 'torah', name: 'Torah reading', prompts: [] }], id)
    expect((await h.getParts(id)).map((p) => p.name)).toEqual(['Torah reading'])
    await h.renameEvent(id, 'Bat mitzvah')
    expect((await h.getEvents()).events.find((e) => e.id === id)?.name).toBe('Bat mitzvah')
    await h.setEvent(id)
    await h.deleteEvent(id)
    const after = await h.getEvents()
    expect(after.events.some((e) => e.id === id)).toBe(false)
    expect(after.current).toBe('auto')
  })

  test('built-in event types cannot be renamed or deleted', async () => {
    const { h } = await setup(1)
    await h.renameEvent('wedding', 'Nope')
    await h.deleteEvent('wedding')
    expect((await h.getEvents()).events.find((e) => e.id === 'wedding')?.name).toBe('Wedding')
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
