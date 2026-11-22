import { createHash } from 'node:crypto'
import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { THUMB_LARGE, THUMB_SMALL, thumbUrl } from '../shared/api'

export { thumbUrl }

export function parseThumbUrl(url: string): { path: string; width: number } {
  const u = new URL(url)
  const path = decodeURIComponent(u.pathname.replace(/^\//, ''))
  const w = Number(u.searchParams.get('w'))
  return { path, width: w === THUMB_LARGE ? THUMB_LARGE : THUMB_SMALL }
}

/** Resized copy of a photo in the cache, keyed by path + modification time + width. */
export async function makeThumb(src: string, width: number, cacheDir: string): Promise<string> {
  const { mtimeMs } = await stat(src)
  const key = createHash('sha1').update(`${src}|${mtimeMs}|${width}`).digest('hex')
  const out = join(cacheDir, `${key}.jpg`)
  try {
    await stat(out)
    return out
  } catch {
    // not cached yet
  }
  await mkdir(cacheDir, { recursive: true })
  await sharp(src).rotate().resize({ width, height: width, fit: 'inside', withoutEnlargement: true, fastShrinkOnLoad: true }).jpeg({ quality: 82 }).toFile(out)
  return out
}
