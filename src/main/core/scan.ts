import { open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import exifr from 'exifr'
import type { PhotoFile, Skipped } from './types'

const JPEG_NAME = /^(?!\._).+\.jpe?g$/i

const EXIF_FIELDS = [
  'DateTimeOriginal',
  'SubSecTimeOriginal',
  'Make',
  'Model',
  'SerialNumber',
  'BodySerialNumber'
]

/** Parses an EXIF "YYYY:MM:DD HH:MM:SS" wall-clock time, stored as if it were UTC. */
export function parseExifTime(dto: unknown, subSec?: unknown): number | undefined {
  if (typeof dto !== 'string') return undefined
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(dto.trim())
  if (!m) return undefined
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number)
  if (y < 1970 || mo < 1 || mo > 12) return undefined
  let ms = 0
  const sub = typeof subSec === 'number' ? String(subSec) : typeof subSec === 'string' ? subSec.trim() : ''
  if (/^\d+$/.test(sub)) ms = Math.round(Number(`0.${sub}`) * 1000)
  return Date.UTC(y, mo - 1, d, h, mi, s, ms)
}

async function looksLikeJpeg(path: string, size: number): Promise<boolean> {
  if (size < 4) return false
  const fh = await open(path, 'r')
  try {
    const buf = Buffer.alloc(2)
    await fh.read(buf, 0, 2, 0)
    return buf[0] === 0xff && buf[1] === 0xd8
  } finally {
    await fh.close()
  }
}

function text(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number') return String(v)
  return undefined
}

export async function scanFolder(dir: string): Promise<{ photos: PhotoFile[]; skipped: Skipped[] }> {
  const entries = await readdir(dir, { withFileTypes: true })
  const photos: PhotoFile[] = []
  const skipped: Skipped[] = []
  for (const e of entries) {
    if (!e.isFile() || !JPEG_NAME.test(e.name)) continue
    const path = join(dir, e.name)
    try {
      const { size } = await stat(path)
      if (!(await looksLikeJpeg(path, size))) {
        skipped.push({ name: e.name, reason: "Couldn't read this file as a JPEG" })
        continue
      }
      let meta: Record<string, unknown> | undefined
      try {
        meta = await exifr.parse(path, { pick: EXIF_FIELDS, reviveValues: false })
      } catch {
        meta = undefined
      }
      photos.push({
        path,
        name: e.name,
        size,
        captureMs: parseExifTime(meta?.DateTimeOriginal, meta?.SubSecTimeOriginal),
        make: text(meta?.Make),
        model: text(meta?.Model),
        serial: text(meta?.SerialNumber) ?? text(meta?.BodySerialNumber)
      })
    } catch {
      skipped.push({ name: e.name, reason: "Couldn't read this file" })
    }
  }
  photos.sort((a, b) => a.name.localeCompare(b.name))
  return { photos, skipped }
}
