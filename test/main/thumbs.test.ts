import { expect, test } from 'vitest'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { makeThumb, parseThumbUrl, thumbUrl } from '../../src/main/thumbs'
import { tempDir } from '../helpers/jpeg'

async function bigJpeg(dir: string, name: string) {
  const p = join(dir, name)
  await sharp({ create: { width: 2000, height: 1000, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toFile(p)
  return p
}

test('thumbnail is no wider than requested and cached on second call', async () => {
  const dir = await tempDir()
  const src = await bigJpeg(dir, 'a.jpg')
  const cache = join(dir, 'cache')
  const first = await makeThumb(src, 320, cache)
  expect((await sharp(first).metadata()).width).toBeLessThanOrEqual(320)
  const t1 = (await stat(first)).mtimeMs
  const second = await makeThumb(src, 320, cache)
  expect(second).toBe(first)
  expect((await stat(second)).mtimeMs).toBe(t1)
})

test('thumb url round-trips paths with spaces and non-ASCII', async () => {
  const dir = await tempDir('Zoë & Tom wedding')
  const src = await bigJpeg(dir, 'Café 1.jpg')
  const url = thumbUrl(src, 1600)
  expect(parseThumbUrl(url)).toEqual({ path: src, width: 1600 })
  expect(await makeThumb(src, 1600, join(dir, 'c'))).toMatch(/\.jpg$/)
})

test('unknown widths fall back to the small size', () => {
  expect(parseThumbUrl(thumbUrl('/x/a.jpg', 99999)).width).toBe(320)
})
