import { describe, expect, test } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { scanFolder } from '../../src/main/core/scan'
import { tempDir, jpegBuffer, writeJpeg } from '../helpers/jpeg'

describe('scanFolder', () => {
  test('lists only top-level jpg/jpeg, case-insensitive', async () => {
    const dir = await tempDir()
    await writeJpeg(dir, 'a.jpg')
    await writeJpeg(dir, 'B.JPG')
    await writeJpeg(dir, 'c.jpeg')
    await writeJpeg(dir, '._d.jpg')
    await writeFile(join(dir, 'e.xmp'), '<x/>')
    await writeFile(join(dir, 'f.CR3'), 'raw')
    await mkdir(join(dir, 'numbered'))
    await writeJpeg(join(dir, 'numbered'), '1.jpg')
    const { photos } = await scanFolder(dir)
    expect(photos.map((p) => p.name).sort()).toEqual(['B.JPG', 'a.jpg', 'c.jpeg'])
  })

  test('finds photos inside sub-folders, skipping numbered/ output, its temp folders and hidden folders', async () => {
    const dir = await tempDir()
    await writeJpeg(dir, 'top.jpg')
    await mkdir(join(dir, 'Camera A', 'Ceremony'), { recursive: true })
    await writeJpeg(join(dir, 'Camera A'), 'IMG_1.jpg')
    await writeJpeg(join(dir, 'Camera A', 'Ceremony'), 'IMG_2.jpg')
    for (const skip of ['numbered', 'numbered.tmp-ab12', 'numbered.old-ab12', '.thumbs']) {
      await mkdir(join(dir, skip))
      await writeJpeg(join(dir, skip), 'nope.jpg')
    }
    const { photos } = await scanFolder(dir)
    expect(photos.map((p) => [p.name, p.folder])).toEqual([
      ['IMG_2.jpg', 'Camera A/Ceremony'],
      ['IMG_1.jpg', 'Camera A'],
      ['top.jpg', '']
    ])
  })

  test('reads DateTimeOriginal + SubSecTimeOriginal as captureMs', async () => {
    const dir = await tempDir()
    await writeJpeg(dir, 'x.jpg', {
      exif: { DateTimeOriginal: '2026:11:07 12:33:29', SubSecTimeOriginal: '416' }
    })
    const { photos } = await scanFolder(dir)
    expect(photos[0].captureMs).toBe(Date.UTC(2026, 10, 7, 12, 33, 29, 416))
  })

  test('missing EXIF gives undefined captureMs, no throw', async () => {
    const dir = await tempDir()
    await writeJpeg(dir, 'plain.jpg')
    const { photos } = await scanFolder(dir)
    expect(photos).toHaveLength(1)
    expect(photos[0].captureMs).toBeUndefined()
  })

  test('zero-byte and truncated files go to skipped', async () => {
    const dir = await tempDir()
    await writeJpeg(dir, 'good.jpg')
    await writeFile(join(dir, 'empty.jpg'), Buffer.alloc(0))
    await writeFile(join(dir, 'junk.jpg'), Buffer.from('not a jpeg at all'))
    const { photos, skipped } = await scanFolder(dir)
    expect(photos.map((p) => p.name)).toEqual(['good.jpg'])
    expect(skipped.map((s) => s.name).sort()).toEqual(['empty.jpg', 'junk.jpg'])
    expect(skipped[0].reason).toMatch(/couldn't read/i)
  })

  test('handles spaces and non-ASCII in path', async () => {
    const dir = await tempDir('Zoë & Tom wedding')
    const buf = await jpegBuffer({ exif: { DateTimeOriginal: '2026:06:01 10:00:00' } })
    await writeFile(join(dir, 'Café shot 1.jpg'), buf)
    const { photos } = await scanFolder(dir)
    expect(photos[0].name).toBe('Café shot 1.jpg')
    expect(photos[0].path).toBe(join(dir, 'Café shot 1.jpg'))
    expect(photos[0].captureMs).toBe(Date.UTC(2026, 5, 1, 10, 0, 0))
  })
})
