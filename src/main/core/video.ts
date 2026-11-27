import { existsSync } from 'node:fs'
import { open, readFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { SortedClip, SortedPhoto } from './types'

const VIDEO = /\.(mp4|mov|m4v|mxf|mts|m2ts|avi)$/i
export const isVideoName = (name: string) => VIDEO.test(name)

export interface VideoInfo {
  /** Start time as wall-clock time stored as if UTC (the same convention as photo capture times) */
  startMs?: number
  durationMs?: number
  fps?: number
  /** Start timecode HH:MM:SS:FF, when the camera recorded one */
  startTimecode?: string
  model?: string
  serial?: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Timecode HH:MM:SS:FF from a frame count (non-drop). */
export function framesToTimecode(frames: number, fps: number): string {
  const f = Math.round(fps)
  const total = Math.max(0, Math.round(frames))
  const ff = total % f
  const s = Math.floor(total / f)
  return `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(ff)}`
}

/** Wall-clock ms (as if UTC) from an ISO date with or without an offset: the local time part is kept. */
function wallClock(iso: string): number | undefined {
  const m = iso.match(/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d):(\d\d)/)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : undefined
}

/** Sony writes "<clip>M01.XML" next to each clip, with the real start timecode and creation time. */
async function readSonyXml(path: string): Promise<VideoInfo | null> {
  const base = basename(path, extname(path))
  const candidates = [join(dirname(path), `${base}M01.XML`), join(dirname(path), `${base}M01.xml`)]
  const xmlPath = candidates.find((p) => existsSync(p))
  if (!xmlPath) return null
  const xml = await readFile(xmlPath, 'utf8')
  const attr = (tag: string, name: string) => xml.match(new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`))?.[1]
  const info: VideoInfo = {}
  const created = attr('CreationDate', 'value')
  if (created) info.startMs = wallClock(created)
  const fps = Number(attr('LtcChangeTable', 'tcFps')) || Number((attr('VideoFrame', 'formatFps') ?? '').replace(/[^\d.]/g, '')) || undefined
  if (fps) info.fps = fps
  // LtcChange value is BCD, frames first: "FFSSMMHH" (the top bits of each byte can carry flags).
  const ltc = xml.match(/<LtcChange\b[^>]*\bframeCount="0"[^>]*\bvalue="([0-9A-Fa-f]{8})"/)?.[1]
  if (ltc) {
    const byte = (i: number) => {
      const b = parseInt(ltc.slice(i * 2, i * 2 + 2), 16) & 0x3f
      return (b >> 4) * 10 + (b & 0x0f)
    }
    info.startTimecode = `${pad(byte(3))}:${pad(byte(2))}:${pad(byte(1))}:${pad(byte(0))}`
  }
  info.model = attr('Device', 'modelName')
  info.serial = attr('Device', 'serialNo')
  return info
}

interface Box { type: string; start: number; size: number; header: number }

function* boxes(buf: Buffer, from = 0, to = buf.length): Generator<Box> {
  let at = from
  while (at + 8 <= to) {
    let size = buf.readUInt32BE(at)
    const type = buf.toString('latin1', at + 4, at + 8)
    let header = 8
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(at + 8))
      header = 16
    } else if (size === 0) size = to - at
    if (size < header || at + size > to) return
    yield { type, start: at, size, header }
    at += size
  }
}
const child = (buf: Buffer, parent: Box, type: string) => {
  for (const b of boxes(buf, parent.start + parent.header, parent.start + parent.size)) if (b.type === type) return b
  return undefined
}
const children = (buf: Buffer, parent: Box, type: string) =>
  [...boxes(buf, parent.start + parent.header, parent.start + parent.size)].filter((b) => b.type === type)

/** Finds the moov box by reading only box headers (moov is often after a multi-gigabyte mdat). */
async function readMoov(path: string): Promise<Buffer | null> {
  const fh = await open(path, 'r')
  try {
    const { size: fileSize } = await fh.stat()
    let at = 0
    const head = Buffer.alloc(16)
    while (at + 8 <= fileSize) {
      await fh.read(head, 0, 16, at)
      let size = head.readUInt32BE(0)
      const type = head.toString('latin1', 4, 8)
      if (size === 1) size = Number(head.readBigUInt64BE(8))
      else if (size === 0) size = fileSize - at
      if (size < 8) return null
      if (type === 'moov') {
        if (size > 64 * 1024 * 1024) return null
        const buf = Buffer.alloc(size)
        await fh.read(buf, 0, size, at)
        return buf
      }
      at += size
    }
    return null
  } finally {
    await fh.close()
  }
}

const MAC_EPOCH_MS = Date.UTC(1904, 0, 1)

async function readMp4(path: string): Promise<VideoInfo> {
  const info: VideoInfo = {}
  const moovBuf = await readMoov(path)
  if (!moovBuf) return info
  const moov = [...boxes(moovBuf)][0]
  const mvhd = child(moovBuf, moov, 'mvhd')
  if (mvhd) {
    const o = mvhd.start + mvhd.header
    const v1 = moovBuf[o] === 1
    const created = v1 ? Number(moovBuf.readBigUInt64BE(o + 4)) : moovBuf.readUInt32BE(o + 4)
    const timescale = moovBuf.readUInt32BE(o + (v1 ? 20 : 12))
    const duration = v1 ? Number(moovBuf.readBigUInt64BE(o + 24)) : moovBuf.readUInt32BE(o + 16)
    if (timescale) info.durationMs = Math.round((duration / timescale) * 1000)
    if (created) {
      // The movie header is UTC; turn it into this computer's wall-clock time, like photo times.
      const d = new Date(MAC_EPOCH_MS + created * 1000)
      info.startMs = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds())
    }
  }
  for (const trak of children(moovBuf, moov, 'trak')) {
    const mdia = child(moovBuf, trak, 'mdia')
    const hdlr = mdia && child(moovBuf, mdia, 'hdlr')
    if (!mdia || !hdlr || moovBuf.toString('latin1', hdlr.start + hdlr.header + 8, hdlr.start + hdlr.header + 12) !== 'tmcd') continue
    const minf = child(moovBuf, mdia, 'minf')
    const stbl = minf && child(moovBuf, minf, 'stbl')
    const stsd = stbl && child(moovBuf, stbl, 'stsd')
    if (!stbl || !stsd) continue
    const entry = stsd.start + stsd.header + 8
    const e = entry + 8 + 8 // after entry header (size,type) and reserved(6)+dataRefIndex(2)
    const timescale = moovBuf.readUInt32BE(e + 8)
    const frameDuration = moovBuf.readUInt32BE(e + 12)
    const nFrames = moovBuf[e + 16]
    const fps = nFrames || (frameDuration ? timescale / frameDuration : 0)
    if (!fps) continue
    info.fps = Math.round(fps * 1000) / 1000
    const stco = child(moovBuf, stbl, 'stco')
    const co64 = child(moovBuf, stbl, 'co64')
    const offset = stco
      ? moovBuf.readUInt32BE(stco.start + stco.header + 8)
      : co64
        ? Number(moovBuf.readBigUInt64BE(co64.start + co64.header + 8))
        : undefined
    if (offset === undefined) continue
    const fh = await open(path, 'r')
    try {
      const b = Buffer.alloc(4)
      const { bytesRead } = await fh.read(b, 0, 4, offset)
      if (bytesRead === 4) info.startTimecode = framesToTimecode(b.readUInt32BE(0), fps)
    } finally {
      await fh.close()
    }
  }
  return info
}

/** Start time, length, frame rate and timecode of a video clip, from whatever the camera recorded. Never throws. */
export async function readVideoInfo(path: string): Promise<VideoInfo> {
  let mp4: VideoInfo = {}
  try {
    if (/\.(mp4|mov|m4v)$/i.test(path)) mp4 = await readMp4(path)
  } catch {
    mp4 = {}
  }
  let sony: VideoInfo | null = null
  try {
    sony = await readSonyXml(path)
  } catch {
    sony = null
  }
  // Sony's XML has the real start time and timecode; the movie header still gives the length.
  return { ...mp4, ...Object.fromEntries(Object.entries(sony ?? {}).filter(([, v]) => v !== undefined)) }
}

export interface PlacedClip extends SortedClip {
  partId: string
  /** Index of the photo it comes after in the day (-1: before the first) */
  after: number
  unsure: boolean
}

/**
 * Places clips among the photos as they are arranged now: each joins the part of the photo nearest in time,
 * before or after it. A clip with no time goes at the end, marked unsure. Clips come back in day order.
 */
export function placeClips(photos: SortedPhoto[], clips: SortedClip[]): PlacedClip[] {
  const last = photos.length - 1
  const lastPart = photos[last]?.partId ?? ''
  const sorted = [...clips].sort((a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity) || a.name.localeCompare(b.name))
  return sorted.map((c) => {
    if (c.startMs === undefined) return { ...c, partId: lastPart, after: last, unsure: true }
    let best = -1
    let bestGap = Infinity
    photos.forEach((p, i) => {
      if (p.correctedMs === undefined) return
      const gap = Math.abs(p.correctedMs - c.startMs!)
      if (gap < bestGap) {
        best = i
        bestGap = gap
      }
    })
    if (best < 0) return { ...c, partId: lastPart, after: last, unsure: true }
    const after = photos[best].correctedMs! <= c.startMs ? best : best - 1
    return { ...c, partId: photos[best].partId, after, unsure: false }
  })
}
