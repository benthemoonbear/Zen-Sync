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
      join('C:\\Users\\Ben\\AppData\\Roaming', 'Adobe', 'Lightroom', 'Export Actions')
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
    expect(onReady).toHaveBeenCalledWith('/x/export', 3)
  })

  test('waits while files in the folder are still being written', async () => {
    let newest = Date.now() + 2500
    const { c, onReady } = setup(() => newest)
    c.add(['/x/export/1.jpg'])
    await vi.advanceTimersByTimeAsync(2100)
    expect(onReady).not.toHaveBeenCalled()
    newest = 0
    await vi.advanceTimersByTimeAsync(2100)
    expect(onReady).toHaveBeenCalledWith('/x/export', 1)
  })

  test('a folder sent directly is sorted as it is', async () => {
    const { c, onReady } = setup()
    c.add(['/x/job'], ['/x/job'])
    await vi.advanceTimersByTimeAsync(2100)
    expect(onReady).toHaveBeenCalledWith('/x/job', 0)
  })

  test('if photos come from more than one folder, the folder with most of them wins', async () => {
    const { c, onReady } = setup()
    c.add(['/a/1.jpg', '/b/1.jpg', '/b/2.jpg'])
    await vi.advanceTimersByTimeAsync(2100)
    expect(onReady).toHaveBeenCalledWith('/b', 2)
  })

  test('a second export later starts afresh', async () => {
    const { c, onReady } = setup()
    c.add(['/x/one/1.jpg'])
    await vi.advanceTimersByTimeAsync(2100)
    c.add(['/x/two/1.jpg'])
    await vi.advanceTimersByTimeAsync(2100)
    expect(onReady.mock.calls).toEqual([['/x/one', 1], ['/x/two', 1]])
  })
})
