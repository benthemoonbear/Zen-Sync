import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createExportCollector, exportActionsDir, pathsFromArgv } from '../../src/main/core/lightroom'
import { tempDir } from '../helpers/jpeg'

describe('photos sent from Lightroom', () => {
  test('picks the JPEGs and folders out of the command line, ignoring the app itself and flags', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'a.jpg'), 'x')
    await writeFile(join(dir, 'b.JPEG'), 'x')
    await writeFile(join(dir, 'notes.txt'), 'x')
    await mkdir(join(dir, 'job'))
    const argv = ['/opt/Zen Sync/zen-sync', '--no-sandbox', join(dir, 'a.jpg'), join(dir, 'b.JPEG'), join(dir, 'notes.txt'), join(dir, 'job'), join(dir, 'missing.jpg')]
    expect(pathsFromArgv(argv)).toEqual([join(dir, 'a.jpg'), join(dir, 'b.JPEG'), join(dir, 'job')])
  })

  test('a development run (electron . args) is not mistaken for photos', () => {
    expect(pathsFromArgv(['/usr/bin/electron', '.', '--inspect'])).toEqual([])
  })

  test('Lightroom puts Zen Sync in its After Export menu from the Export Actions folder', () => {
    expect(exportActionsDir('win32', { APPDATA: 'C:\\Users\\Ben\\AppData\\Roaming' }, 'C:\\Users\\Ben')).toBe(
      'C:\\Users\\Ben\\AppData\\Roaming\\Adobe\\Lightroom\\Export Actions'
    )
    expect(exportActionsDir('darwin', {}, '/Users/ben')).toBe('/Users/ben/Library/Application Support/Adobe/Lightroom/Export Actions')
    expect(exportActionsDir('linux', {}, '/home/ben')).toBeNull()
  })
})

describe('waiting for a Lightroom export to finish', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = (newestMs: () => number = () => 0) => {
    const onReady = vi.fn()
    const c = createExportCollector({ quietMs: 2000, settleMs: 1500, newestChangeMs: async () => newestMs(), onReady, now: () => Date.now() })
    return { c, onReady }
  }

  test('batches arriving during one export become one sort of that folder', async () => {
    const { c, onReady } = setup()
    c.add(['/x/export/1.jpg', '/x/export/2.jpg'])
    await vi.advanceTimersByTimeAsync(1500)
    c.add(['/x/export/3.jpg'])
    await vi.advanceTimersByTimeAsync(1500)
    expect(onReady).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(600)
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(onReady).toHaveBeenCalledWith('/x/export', ['/x/export/1.jpg', '/x/export/2.jpg', '/x/export/3.jpg'])
  })

  test('waits while files in the folder are still being written', async () => {
    let newest = Date.now() + 2500
    const { c, onReady } = setup(() => newest)
    c.add(['/x/export/1.jpg'])
    await vi.advanceTimersByTimeAsync(2100)
    expect(onReady).not.toHaveBeenCalled()
    newest = 0
    await vi.advanceTimersByTimeAsync(2100)
    expect(onReady).toHaveBeenCalledWith('/x/export', ['/x/export/1.jpg'])
  })

  test('a folder sent directly is sorted as it is', async () => {
    const { c, onReady } = setup()
    c.add(['/x/job'], ['/x/job'])
    await vi.advanceTimersByTimeAsync(2100)
    expect(onReady).toHaveBeenCalledWith('/x/job', [])
  })

  test('if photos come from more than one folder, the folder with most of them wins', async () => {
    const { c, onReady } = setup()
    c.add(['/a/1.jpg', '/b/1.jpg', '/b/2.jpg'])
    await vi.advanceTimersByTimeAsync(2100)
    expect(onReady).toHaveBeenCalledWith('/b', ['/b/1.jpg', '/b/2.jpg'])
  })

  test('the same photo sent twice (Capture One sends one at a time) counts once', async () => {
    const { c, onReady } = setup()
    c.add(['/x/e/1.jpg'])
    c.add(['/x/e/1.jpg', '/x/e/2.jpg'])
    await vi.advanceTimersByTimeAsync(2100)
    expect(onReady).toHaveBeenCalledWith('/x/e', ['/x/e/1.jpg', '/x/e/2.jpg'])
  })

  test('a second export later starts afresh', async () => {
    const { c, onReady } = setup()
    c.add(['/x/one/1.jpg'])
    await vi.advanceTimersByTimeAsync(2100)
    c.add(['/x/two/1.jpg'])
    await vi.advanceTimersByTimeAsync(2100)
    expect(onReady.mock.calls).toEqual([['/x/one', ['/x/one/1.jpg']], ['/x/two', ['/x/two/1.jpg']]])
  })
})

describe('watching a folder for new exports', () => {
  test('reacts to new JPEGs anywhere inside, but never to Zen Sync’s own saved copies or hidden files', async () => {
    const { isWatchedPhoto } = await import('../../src/main/core/lightroom')
    expect(isWatchedPhoto('/w', '/w/Smith wedding/IMG_1.jpg')).toBe(true)
    expect(isWatchedPhoto('/w', '/w/IMG_1.JPG')).toBe(true)
    expect(isWatchedPhoto('/w', '/w/Smith wedding/numbered/1.jpg')).toBe(false)
    expect(isWatchedPhoto('/w', '/w/Smith wedding/numbered/03 Reception/01 Drinks/40.jpg')).toBe(false)
    expect(isWatchedPhoto('/w', '/w/Smith wedding/numbered.tmp-ab12/1.jpg')).toBe(false)
    expect(isWatchedPhoto('/w', '/w/.thumbs/a.jpg')).toBe(false)
    expect(isWatchedPhoto('/w', '/w/notes.txt')).toBe(false)
    expect(isWatchedPhoto('/w', '/elsewhere/a.jpg')).toBe(false)
  })

  test('a real export landing in the watched folder is reported once it settles', async () => {
    const { watchFolder } = await import('../../src/main/core/lightroom')
    const root = await tempDir('watch')
    const got: string[][] = []
    const stop = watchFolder(root, (paths) => got.push(paths))
    await mkdir(join(root, 'Smith wedding', 'numbered'), { recursive: true })
    await new Promise((r) => setTimeout(r, 100))
    await writeFile(join(root, 'Smith wedding', 'a.jpg'), 'x')
    await writeFile(join(root, 'Smith wedding', 'numbered', '1.jpg'), 'x')
    await new Promise((r) => setTimeout(r, 400))
    stop()
    const all = got.flat()
    expect(all).toContain(join(root, 'Smith wedding', 'a.jpg'))
    expect(all.some((p) => p.includes('numbered'))).toBe(false)
  })
})

describe('watching a synced job', () => {
  test('deleting a photo is noticed when asked to include removals', async () => {
    const { watchFolder } = await import('../../src/main/core/lightroom')
    const { rm } = await import('node:fs/promises')
    const root = await tempDir('job')
    await writeFile(join(root, 'a.jpg'), 'x')
    const got: string[] = []
    const stop = watchFolder(root, (p) => got.push(...p), { includeRemoved: true })
    await new Promise((r) => setTimeout(r, 100))
    await rm(join(root, 'a.jpg'))
    await new Promise((r) => setTimeout(r, 400))
    stop()
    expect(got).toContain(join(root, 'a.jpg'))
  })
})

describe('darktable', () => {
  test('installs the Zen Sync export script, pointing at this copy of Zen Sync, and loads it once', async () => {
    const { installDarktable } = await import('../../src/main/core/lightroom')
    const { readFile } = await import('node:fs/promises')
    const config = await tempDir('darktable')
    const script = '-- zen sync\nlocal ZEN_SYNC = "__ZEN_SYNC_APP__"\n'
    await writeFile(join(config, 'luarc'), 'require "other"\n')
    await installDarktable(config, '/opt/Zen Sync/Zen-Sync.AppImage', script)
    await installDarktable(config, '/opt/Zen Sync/Zen-Sync.AppImage', script)
    expect(await readFile(join(config, 'lua', 'zen_sync.lua'), 'utf8')).toContain('"/opt/Zen Sync/Zen-Sync.AppImage"')
    const luarc = await readFile(join(config, 'luarc'), 'utf8')
    expect(luarc.match(/require "zen_sync"/g)).toHaveLength(1)
    expect(luarc).toContain('require "other"')
  })

  test('a Windows path is written so Lua reads it correctly', async () => {
    const { installDarktable } = await import('../../src/main/core/lightroom')
    const { readFile } = await import('node:fs/promises')
    const config = await tempDir('darktable')
    await installDarktable(config, 'C:\\Users\\Ben\\Zen Sync\\Zen Sync.exe', 'local ZEN_SYNC = "__ZEN_SYNC_APP__"')
    expect(await readFile(join(config, 'lua', 'zen_sync.lua'), 'utf8')).toContain('"C:\\\\Users\\\\Ben\\\\Zen Sync\\\\Zen Sync.exe"')
  })

  test('darktable keeps its settings in a known place on each system', async () => {
    const { darktableConfigDir } = await import('../../src/main/core/lightroom')
    expect(darktableConfigDir('linux', {}, '/home/ben')).toBe('/home/ben/.config/darktable')
    expect(darktableConfigDir('darwin', {}, '/Users/ben')).toBe('/Users/ben/.config/darktable')
    expect(darktableConfigDir('win32', { LOCALAPPDATA: 'C:\\L' }, 'C:\\Users\\Ben')).toBe('C:\\L\\darktable')
  })
})
