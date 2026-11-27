import { describe, expect, test } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readVideoInfo, isVideoName } from '../../src/main/core/video'
import { tempDir } from '../helpers/jpeg'

// --- tiny ISO-BMFF builder ---
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b }
const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b }
const box = (type: string, ...parts: Buffer[]) => { const body = Buffer.concat(parts); return Buffer.concat([u32(8 + body.length), Buffer.from(type, 'latin1'), body]) }
const MAC_EPOCH = Date.UTC(1904, 0, 1) / 1000
const mvhd = (createdUtcSec: number, timescale: number, duration: number) =>
  box('mvhd', Buffer.from([0, 0, 0, 0]), u32(createdUtcSec - MAC_EPOCH), u32(createdUtcSec - MAC_EPOCH), u32(timescale), u32(duration), Buffer.alloc(80))
const hdlr = (type: string) => box('hdlr', Buffer.alloc(4), Buffer.alloc(4), Buffer.from(type, 'latin1'), Buffer.alloc(12), Buffer.from([0]))

/** A minimal MP4 with a movie header and (optionally) a QuickTime timecode track whose first sample is `startFrame`. */
function mp4(createdUtcSec: number, seconds: number, tc?: { fps: number; startFrame: number }) {
  const ftyp = box('ftyp', Buffer.from('isom'), u32(0), Buffer.from('isom'))
  const tracks: Buffer[] = []
  let mdat = Buffer.alloc(0)
  if (tc) mdat = u32(tc.startFrame)
  const head = Buffer.concat([ftyp])
  // Build moov with a placeholder chunk offset, then fix it once sizes are known.
  const build = (offset: number) => {
    // reserved(4) flags(4) timescale(4) frameDuration(4) numberOfFrames(1) reserved(1)
    const tmcdEntry = Buffer.concat([u32(0), u32(0), u32(tc ? tc.fps * 1000 : 0), u32(1000), Buffer.from([tc?.fps ?? 0]), Buffer.from([0])])
    const stsd = box('stsd', Buffer.alloc(4), u32(1), box('tmcd', Buffer.alloc(6), u16(1), tmcdEntry))
    const stco = box('stco', Buffer.alloc(4), u32(1), u32(offset))
    const trak = box('trak', box('mdia', hdlr('tmcd'), box('minf', box('stbl', stsd, stco))))
    return box('moov', mvhd(createdUtcSec, 1000, seconds * 1000), ...(tc ? [trak] : []), ...tracks)
  }
  let moov = build(0)
  const mdatBox = box('mdat', mdat)
  moov = build(head.length + moov.length + 8)
  return Buffer.concat([head, moov, mdatBox])
}

describe('reading video clips', () => {
  test('knows video files by name', () => {
    expect(isVideoName('C0001.MP4')).toBe(true)
    expect(isVideoName('clip.mov')).toBe(true)
    expect(isVideoName('A001.MXF')).toBe(true)
    expect(isVideoName('00001.MTS')).toBe(true)
    expect(isVideoName('IMG_1.jpg')).toBe(false)
    expect(isVideoName('C0001M01.XML')).toBe(false)
  })

  test('Sony clips: start time and timecode come from the XML Sony writes next to the clip', async () => {
    const dir = await tempDir('video')
    await writeFile(join(dir, 'C0001.MP4'), mp4(Date.UTC(2026, 6, 4, 13, 30, 0) / 1000, 42))
    await writeFile(join(dir, 'C0001M01.XML'), `<?xml version="1.0" encoding="UTF-8"?>
<NonRealTimeMeta xmlns="urn:schemas-professionalDisc:nonRealTimeMeta:ver.2.20">
  <Duration value="1050"/>
  <LtcChangeTable tcFps="25" halfStep="false">
    <LtcChange frameCount="0" value="15000014" status="increment"/>
    <LtcChange frameCount="1049" value="22410014" status="end"/>
  </LtcChangeTable>
  <CreationDate value="2026-07-04T14:30:00+01:00"/>
  <VideoFormat><VideoFrame videoCodec="AVC_3840_2160_HP@L51" captureFps="25p" formatFps="25p"/></VideoFormat>
  <Device manufacturer="Sony" modelName="ILME-FX3" serialNo="1234567"/>
</NonRealTimeMeta>`)
    const v = await readVideoInfo(join(dir, 'C0001.MP4'))
    expect(v.startMs).toBe(Date.UTC(2026, 6, 4, 14, 30, 0)) // wall-clock time, like photo EXIF
    expect(v.fps).toBe(25)
    expect(v.startTimecode).toBe('14:00:00:15') // Sony stores BCD frames-seconds-minutes-hours
    expect(v.durationMs).toBe(42_000)
    expect(v.model).toBe('ILME-FX3')
    expect(v.serial).toBe('1234567')
  })

  test('other cameras: timecode track and movie header', async () => {
    const dir = await tempDir('video')
    await writeFile(join(dir, 'A001.mov'), mp4(Date.UTC(2026, 6, 4, 13, 0, 0) / 1000, 10, { fps: 25, startFrame: 25 * 3600 * 13 + 25 * 60 }))
    const v = await readVideoInfo(join(dir, 'A001.mov'))
    expect(v.durationMs).toBe(10_000)
    expect(v.fps).toBe(25)
    expect(v.startTimecode).toBe('13:01:00:00')
    expect(v.startMs).toBeDefined()
  })

  test('a file that isn’t a readable movie gives what it can, without throwing', async () => {
    const dir = await tempDir('video')
    await writeFile(join(dir, 'broken.mp4'), 'not a movie')
    const v = await readVideoInfo(join(dir, 'broken.mp4'))
    expect(v.durationMs).toBeUndefined()
    expect(v.startTimecode).toBeUndefined()
  })
})
