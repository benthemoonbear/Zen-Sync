import { describe, expect, test } from 'vitest'
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { placeClips } from '../../src/main/core/video'
import { planOutput, writeCopies } from '../../src/main/core/save'
import { dayOrderEdl, partMarkersEdl, dayOrderCsv, timecodeFiles } from '../../src/main/core/timecode'
import type { Part, SortedClip, SortedPhoto } from '../../src/main/core/types'
import { tempDir, writeJpeg } from '../helpers/jpeg'

const T = (h: number, m: number) => Date.UTC(2026, 6, 4, h, m)
const photo = (name: string, partId: string, ms?: number): SortedPhoto => ({ path: `/in/${name}`, name, cameraId: 'a', partId, correctedMs: ms, unsure: false })
const clip = (name: string, ms?: number, extra: Partial<SortedClip> = {}): SortedClip => ({ path: `/in/${name}`, name, startMs: ms, durationMs: 10_000, fps: 25, ...extra })
const parts: Part[] = [
  { id: 'prep', name: 'Getting ready', prompts: [] },
  { id: 'ceremony', name: 'Ceremony', prompts: [], group: 'Ceremony' },
  { id: 'speeches', name: 'Speeches', prompts: [] }
]
const photos = [photo('1.jpg', 'prep', T(11, 0)), photo('2.jpg', 'prep', T(11, 30)), photo('3.jpg', 'ceremony', T(13, 0)), photo('4.jpg', 'speeches', T(17, 0))]

describe('placing video clips among the photos', () => {
  test('each clip joins the part of the photo closest in time, in day order', () => {
    const placed = placeClips(photos, [clip('C2.MP4', T(16, 50)), clip('C1.MP4', T(12, 55)), clip('C0.MP4', T(10, 0))])
    expect(placed.map((c) => [c.name, c.partId, c.after])).toEqual([
      ['C0.MP4', 'prep', -1], // before the first photo
      ['C1.MP4', 'ceremony', 1], // five minutes before the ceremony starts: ceremony, not prep
      ['C2.MP4', 'speeches', 2]
    ])
  })

  test('a clip with no time goes at the end, marked unsure', () => {
    const [c] = placeClips(photos, [clip('X.MOV')])
    expect(c.partId).toBe('speeches')
    expect(c.unsure).toBe(true)
  })

  test('with photos moved by hand, a clip follows the part its nearest photo is now in', () => {
    const moved = photos.map((p) => (p.name === '3.jpg' ? { ...p, partId: 'prep' } : p))
    expect(placeClips(moved, [clip('C1.MP4', T(12, 59))])[0].partId).toBe('prep')
  })
})

describe('saving clips with the photos', () => {
  test('clips go into their part folders as V001…, photos keep their numbers', () => {
    const plan = planOutput(photos, parts, 'perPart', [clip('C1.MP4', T(12, 55)), clip('C2.mov', T(16, 50))])
    expect(plan.map((c) => c.rel)).toEqual([
      '01 Getting ready/1.jpg',
      '01 Getting ready/2.jpg',
      '02 Ceremony/01 Ceremony/V001.mp4',
      '02 Ceremony/01 Ceremony/3.jpg',
      '03 Speeches/V002.mov',
      '03 Speeches/4.jpg'
    ])
  })

  test('photo numbers carry on past clips; clip numbers are their own', () => {
    const plan = planOutput([photos[0], photos[3]], parts, 'perPart', [clip('C1.MP4', T(11, 1))])
    expect(plan.map((c) => c.rel)).toEqual(['01 Getting ready/1.jpg', '01 Getting ready/V001.mp4', '02 Speeches/2.jpg'])
  })

  test('with no photos at all, clips go in the first part', () => {
    expect(planOutput([], parts, 'perPart', [clip('C1.MP4', T(9, 0))]).map((c) => c.rel)).toEqual(['01 Getting ready/V001.mp4'])
  })

  test('one folder: clips sit alongside', () => {
    const plan = planOutput(photos, parts, 'single', [clip('C1.MP4', T(12, 55))])
    expect(plan.map((c) => c.rel)).toEqual(['1.jpg', '2.jpg', 'V001.mp4', '3.jpg', '4.jpg'])
  })

  test('clips don’t count towards the free photo limit, and extra files are written', async () => {
    const dir = await tempDir('tc')
    await writeJpeg(dir, 'a.jpg')
    await writeFile(join(dir, 'C1.MP4'), 'movie')
    const plan = [
      { src: join(dir, 'a.jpg'), rel: '1.jpg' },
      ...Array.from({ length: 300 }, (_, i) => ({ src: join(dir, 'C1.MP4'), rel: `V${String(i + 1).padStart(3, '0')}.mp4`, clip: true }))
    ]
    const res = await writeCopies(dir, plan, { overwrite: false, mode: 'single', licensed: false, extra: [{ rel: 'Timecode/Day order.csv', content: 'x' }] })
    expect(res).toEqual({ written: 301 })
    expect(await readFile(join(dir, 'numbered', 'Timecode', 'Day order.csv'), 'utf8')).toBe('x')
    expect((await readdir(join(dir, 'numbered'))).length).toBe(302)
  })
})

test('clips are linked, not copied, when the drive allows it, so big files cost no time or space', async () => {
  const { stat } = await import('node:fs/promises')
  const dir = await tempDir('tc')
  await writeFile(join(dir, 'C1.MP4'), 'movie')
  await writeCopies(dir, [{ src: join(dir, 'C1.MP4'), rel: 'V001.mp4', clip: true }], { overwrite: false, mode: 'single', licensed: true })
  const [a, b] = await Promise.all([stat(join(dir, 'C1.MP4')), stat(join(dir, 'numbered', 'V001.mp4'))])
  expect(b.ino).toBe(a.ino)
})

describe('timecode lists for editing', () => {
  const ordered = [
    { file: 'V001.mp4', part: 'Getting ready', startMs: T(11, 1), durationMs: 10_000, fps: 25, startTimecode: '11:01:00:00' },
    { file: 'V002.mp4', part: 'Getting ready', startMs: T(11, 5), durationMs: 2_000, fps: 25 },
    { file: 'V003.mp4', part: 'Ceremony', startMs: T(13, 0), durationMs: 4_520, fps: 25, startTimecode: '13:00:00:12' }
  ]

  test('day-order EDL lays the clips end to end from 01:00:00:00, using each clip’s own timecode', () => {
    const edl = dayOrderEdl(ordered, 'Smith wedding')
    expect(edl).toContain('TITLE: Smith wedding\r\nFCM: NON-DROP FRAME')
    expect(edl).toContain('001  AX       AA/V  C        11:01:00:00 11:01:10:00 01:00:00:00 01:00:10:00')
    expect(edl).toContain('* FROM CLIP NAME: V001.mp4')
    expect(edl).toContain('002  AX       AA/V  C        00:00:00:00 00:00:02:00 01:00:10:00 01:00:12:00')
    expect(edl).toContain('003  AX       AA/V  C        13:00:00:12 13:00:05:00 01:00:12:00 01:00:16:13')
  })

  test('marker EDL puts a Resolve marker where each part starts', () => {
    const edl = partMarkersEdl(ordered, 'Smith wedding')
    const markers = edl.split('\r\n').filter((l) => l.includes('|M:'))
    expect(markers).toEqual([' |C:ResolveColorBlue |M:Getting ready |D:1', ' |C:ResolveColorGreen |M:Ceremony |D:1'])
    expect(edl).toContain('002  001      V     C        01:00:12:00 01:00:12:01 01:00:12:00 01:00:12:01')
  })

  test('CSV lists every clip with its part, time of day and timecodes', () => {
    const csv = dayOrderCsv(ordered).split('\r\n')
    expect(csv[0]).toBe('Number,File,Part,Time of day,Source timecode,Duration,Timeline in')
    expect(csv[1]).toBe('1,V001.mp4,Getting ready,11:01:00,11:01:00:00,00:00:10:00,01:00:00:00')
    expect(csv[2]).toBe('2,V002.mp4,Getting ready,11:05:00,,00:00:02:00,01:00:10:00')
  })

  test('timeline frame rate is the one most clips use; a name with a comma is quoted', () => {
    const files = timecodeFiles(
      [{ file: 'a,b.mp4', part: 'Prep', durationMs: 1000, fps: 50 }, { file: 'c.mp4', part: 'Prep', durationMs: 1000, fps: 50 }, { file: 'd.mp4', part: 'Prep', durationMs: 1000, fps: 25 }],
      'Job'
    )
    expect(files.map((f) => f.rel)).toEqual(['Timecode/Day order.edl', 'Timecode/Part markers (Resolve).edl', 'Timecode/Day order.csv'])
    expect(files[0].content).toContain('01:00:01:00 01:00:02:00') // 50 fps: one second = 50 frames
    expect(files[2].content).toContain('"a,b.mp4"')
  })
})
