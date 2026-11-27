import { basename } from 'node:path'
import type { PlannedCopy } from './save'
import type { Part, SortedClip } from './types'
import { framesToTimecode } from './video'

/** One clip as it goes to the editor, in day order */
export interface TimecodeClip {
  file: string
  part: string
  startMs?: number
  durationMs?: number
  fps?: number
  startTimecode?: string
}

const CRLF = '\r\n'
const TIMELINE_START = 3600 // 01:00:00:00, the usual first frame of an edit timeline
const COLOURS = ['Blue', 'Green', 'Yellow', 'Red', 'Purple', 'Cyan', 'Pink', 'Fuchsia', 'Rose', 'Lavender', 'Sky', 'Mint', 'Lemon', 'Sand', 'Cocoa', 'Cream']

/** The frame rate most clips use (whole frames), 25 if none say. */
export function timelineFps(clips: TimecodeClip[]): number {
  const counts = new Map<number, number>()
  for (const c of clips) if (c.fps) counts.set(Math.round(c.fps), (counts.get(Math.round(c.fps)) ?? 0) + 1)
  let best = 25
  let n = 0
  for (const [fps, count] of counts) if (count > n) [best, n] = [fps, count]
  return best
}

function tcToFrames(tc: string | undefined, fps: number): number {
  const m = tc?.match(/^(\d\d):(\d\d):(\d\d)[:;](\d\d)$/)
  return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * fps + +m[4] : 0
}

const frames = (ms: number | undefined, fps: number) => Math.max(1, Math.round(((ms ?? 0) / 1000) * fps))

/** Each clip's source in/out and where it sits on a timeline that lays the day end to end. */
function layout(clips: TimecodeClip[]) {
  const fps = timelineFps(clips)
  let rec = TIMELINE_START * fps
  const rows = clips.map((c) => {
    const len = frames(c.durationMs, fps)
    const srcIn = tcToFrames(c.startTimecode, fps)
    const row = { clip: c, srcIn, srcOut: srcIn + len, recIn: rec, recOut: rec + len }
    rec += len
    return row
  })
  return { fps, rows }
}

const pad = (s: string, n: number) => s.padEnd(n)
const event = (n: number, reel: string, track: string, a: number, b: number, c: number, d: number, fps: number) =>
  `${String(n).padStart(3, '0')}  ${pad(reel, 8)} ${pad(track, 5)} C        ${framesToTimecode(a, fps)} ${framesToTimecode(b, fps)} ${framesToTimecode(c, fps)} ${framesToTimecode(d, fps)}`

const header = (title: string) => [`TITLE: ${title.replace(/[\r\n]/g, ' ')}`, 'FCM: NON-DROP FRAME', '']

/** A CMX 3600 EDL of every clip in day order, end to end: import it as a timeline and link the clips. */
export function dayOrderEdl(clips: TimecodeClip[], title: string): string {
  const { fps, rows } = layout(clips)
  const lines = header(title)
  rows.forEach((r, i) => {
    lines.push(event(i + 1, 'AX', 'AA/V', r.srcIn, r.srcOut, r.recIn, r.recOut, fps), `* FROM CLIP NAME: ${r.clip.file}`, '')
  })
  return lines.join(CRLF)
}

/** Timeline markers where each part of the day starts, in the EDL form DaVinci Resolve imports. */
export function partMarkersEdl(clips: TimecodeClip[], title: string): string {
  const { fps, rows } = layout(clips)
  const lines = header(title)
  let n = 0
  let prev: string | undefined
  for (const r of rows) {
    if (r.clip.part === prev) continue
    prev = r.clip.part
    lines.push(event(++n, '001', 'V', r.recIn, r.recIn + 1, r.recIn, r.recIn + 1, fps))
    lines.push(` |C:ResolveColor${COLOURS[(n - 1) % COLOURS.length]} |M:${r.clip.part.replace(/[|\r\n]/g, ' ')} |D:1`, '')
  }
  return lines.join(CRLF)
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const timeOfDay = (ms?: number) => {
  if (ms === undefined) return ''
  const d = new Date(ms)
  return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map((x) => String(x).padStart(2, '0')).join(':')
}

/** A spreadsheet-friendly list of the clips: part, time of day, source timecode, length and timeline position. */
export function dayOrderCsv(clips: TimecodeClip[]): string {
  const { fps, rows } = layout(clips)
  const lines = ['Number,File,Part,Time of day,Source timecode,Duration,Timeline in']
  rows.forEach((r, i) =>
    lines.push(
      [String(i + 1), r.clip.file, r.clip.part, timeOfDay(r.clip.startMs), r.clip.startTimecode ?? '', framesToTimecode(r.recOut - r.recIn, fps), framesToTimecode(r.recIn, fps)]
        .map(csvCell)
        .join(',')
    )
  )
  return lines.join(CRLF) + CRLF
}

/** The three files written into numbered/Timecode. */
export function timecodeFiles(clips: TimecodeClip[], title: string): { rel: string; content: string }[] {
  return [
    { rel: 'Timecode/Day order.edl', content: dayOrderEdl(clips, title) },
    { rel: 'Timecode/Part markers (Resolve).edl', content: partMarkersEdl(clips, title) },
    { rel: 'Timecode/Day order.csv', content: dayOrderCsv(clips) }
  ]
}

/**
 * The clips in a save plan, in day order, as the editor will see them: the copied file name
 * (or the original name when clips aren't copied) and the part each is in.
 */
export function clipsForTimecode(plan: PlannedCopy[], clips: SortedClip[], parts: Part[], copied: boolean): TimecodeClip[] {
  const bySrc = new Map(clips.map((c) => [c.path, c]))
  return plan
    .filter((c) => c.clip)
    .map((c) => {
      const clip = bySrc.get(c.src)
      const part = parts.find((p) => p.id === c.partId)
      return {
        file: copied ? basename(c.rel) : (clip?.name ?? basename(c.src)),
        part: part?.name ?? c.partId ?? '',
        startMs: clip?.startMs,
        durationMs: clip?.durationMs,
        fps: clip?.fps,
        startTimecode: clip?.startTimecode
      }
    })
}
