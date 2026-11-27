import { describe, expect, test } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { applyClockFix, reclassify, runSort } from '../../src/main/core/pipeline'
import { FakeEmbedder } from '../fakes/fakeEmbedder'
import { tempDir, writeJpeg } from '../helpers/jpeg'
import type { Part } from '../../src/main/core/types'

const parts: Part[] = [
  { id: 'ceremony', name: 'Ceremony', prompts: ['ceremony'] },
  { id: 'confetti', name: 'Confetti', prompts: ['confetti'] }
]
const exif = (t: string) => ({ exif: { DateTimeOriginal: t } })

async function wedding() {
  const dir = await tempDir()
  await writeJpeg(dir, 'AAA001.jpg', exif('2026:11:07 12:00:00'))
  await writeJpeg(dir, 'AAA002.jpg', exif('2026:11:07 12:10:00'))
  await writeJpeg(dir, 'AAA003.jpg', exif('2026:11:07 12:20:00'))
  await writeJpeg(dir, 'BBB001.jpg', exif('2026:11:07 03:00:00'))
  await writeJpeg(dir, 'BBB002.jpg', exif('2026:11:07 03:20:00'))
  await writeFile(join(dir, 'broken.jpg'), 'nope')
  const emb = new FakeEmbedder({
    ceremony: [1, 0, 0, 0], confetti: [0, 1, 0, 0],
    'AAA001.jpg': [1, 0, 0.1, 0], 'AAA002.jpg': [0.9, 0.2, 0.3, 0], 'AAA003.jpg': [0, 1, 0, 0.1],
    'BBB001.jpg': [1, 0, 0.1, 0], 'BBB002.jpg': [0, 1, 0, 0.1]
  })
  return { dir, emb }
}

describe('runSort', () => {
  test('video clips in the folder are placed into the day with the photos', async () => {
    const { dir, emb } = await wedding()
    await writeFile(join(dir, 'C0001.MP4'), 'movie')
    await writeFile(join(dir, 'C0001M01.XML'), '<NonRealTimeMeta><CreationDate value="2026-11-07T12:19:00Z"/></NonRealTimeMeta>')
    const { result } = await runSort(dir, { embedder: emb, parts })
    expect(result.clips?.map((c) => [c.name, c.partId])).toEqual([['C0001.MP4', 'confetti']])
    expect(result.photos.map((p) => p.name)).not.toContain('C0001.MP4')
    const only = await runSort(dir, { embedder: emb, parts, only: [join(dir, 'AAA001.jpg')] })
    expect(only.result.clips).toEqual([]) // an editor's export is photos only
  })

  test('returns every readable photo exactly once and reports skipped files', async () => {
    const { dir, emb } = await wedding()
    const { result } = await runSort(dir, { embedder: emb, parts })
    expect(result.photos.map((p) => p.name).sort()).toEqual(['AAA001.jpg', 'AAA002.jpg', 'AAA003.jpg', 'BBB001.jpg', 'BBB002.jpg'])
    expect(result.skipped.map((s) => s.name)).toEqual(['broken.jpg'])
    expect(result.cameras).toHaveLength(2)
  })

  test('assigns parts and orders by part', async () => {
    const { dir, emb } = await wedding()
    const { result } = await runSort(dir, { embedder: emb, parts })
    const byName = Object.fromEntries(result.photos.map((p) => [p.name, p.partId]))
    expect(byName['AAA001.jpg']).toBe('ceremony')
    expect(byName['AAA003.jpg']).toBe('confetti')
    const idx = (n: string) => result.photos.findIndex((p) => p.name === n)
    expect(idx('AAA001.jpg')).toBeLessThan(idx('AAA003.jpg'))
  })

  test('does not apply clock suggestions until applyClockFix is called', async () => {
    const { dir, emb } = await wedding()
    const session = await runSort(dir, { embedder: emb, parts })
    expect(session.result.clock).toHaveLength(1)
    expect(session.result.clock[0].cameraId).toBe('prefix:BBB')
    const before = session.result.photos.find((p) => p.name === 'BBB001.jpg')!
    expect(before.correctedMs).toBe(Date.UTC(2026, 10, 7, 3, 0))
    const fixed = applyClockFix(session, 'prefix:BBB')
    const after = fixed.result.photos.find((p) => p.name === 'BBB001.jpg')!
    expect(after.correctedMs).toBe(Date.UTC(2026, 10, 7, 12, 0))
    expect(fixed.result.clock).toEqual([])
  })

  test('marks unsure photos from scores', async () => {
    const { dir, emb } = await wedding()
    const { result } = await runSort(dir, { embedder: emb, parts })
    expect(result.photos.find((p) => p.name === 'AAA001.jpg')!.unsure).toBe(false)
  })

  test('reports progress stages', async () => {
    const { dir, emb } = await wedding()
    const stages = new Set<string>()
    await runSort(dir, { embedder: emb, parts, onProgress: (s) => stages.add(s) })
    expect([...stages]).toEqual(['scan', 'analyse', 'arrange'])
  })
})

test('a photo the model cannot read is skipped, the rest still sort', async () => {
  const { dir, emb } = await wedding()
  const flaky = {
    embedTexts: (t: string[]) => emb.embedTexts(t),
    embedImages: async (paths: string[]) => {
      if (paths.some((p) => p.endsWith('AAA002.jpg'))) throw new Error('decode failed')
      return emb.embedImages(paths)
    }
  }
  const { result } = await runSort(dir, { embedder: flaky, parts })
  expect(result.photos).toHaveLength(4)
  expect(result.skipped.map((s) => s.name).sort()).toEqual(['AAA002.jpg', 'broken.jpg'])
})

test('corrections from earlier weddings steer the sort', async () => {
  const { dir, emb } = await wedding()
  const { addCorrection } = await import('../../src/main/core/corrections')
  const [aaa1] = await emb.embedImages([join(dir, 'AAA001.jpg')])
  const corrections = addCorrection([], aaa1, 'confetti')
  const { result } = await runSort(dir, { embedder: emb, parts, corrections })
  expect(result.photos.find((p) => p.name === 'AAA001.jpg')!.partId).toBe('confetti')
})

test('a photo the smoothing moved away from a confident choice is marked unsure', async () => {
  const dir = await tempDir()
  for (const [n, t] of [['C001', '12:00:00'], ['C002', '12:01:00'], ['C003', '12:02:00'], ['C004', '12:03:00']])
    await writeJpeg(dir, `${n}.jpg`, exif(`2026:11:07 ${t}`))
  const emb = new FakeEmbedder({
    ceremony: [1, 0, 0, 0], confetti: [0, 1, 0, 0],
    'C001.jpg': [1, 0, 0, 0], 'C002.jpg': [0.2, 1, 0, 0], 'C003.jpg': [1, 0, 0, 0], 'C004.jpg': [1, 0, 0, 0]
  })
  const s = await runSort(dir, { embedder: emb, parts })
  const c2 = s.result.photos.find((p) => p.name === 'C002.jpg')!
  expect(c2.partId).toBe('ceremony')
  expect(c2.unsure).toBe(true)
})

test('if the model fails on every photo, the sort fails with MODEL_FAILED', async () => {
  const { dir, emb } = await wedding()
  const broken = { embedTexts: (t: string[]) => emb.embedTexts(t), embedImages: async () => { throw new Error('out of memory') } }
  await expect(runSort(dir, { embedder: broken, parts })).rejects.toThrow('MODEL_FAILED')
})

describe('dynamic events', () => {
  test('the parts can be chosen after the photos are seen (automatic event type)', async () => {
    const { dir, emb } = await wedding()
    let seen = 0
    const { result } = await runSort(dir, {
      embedder: emb,
      parts: [],
      choose: async (images) => {
        seen = images.length
        return { parts, event: { id: 'wedding', name: 'Wedding', detected: true } }
      }
    })
    expect(seen).toBe(5)
    expect(result.event).toEqual({ id: 'wedding', name: 'Wedding', detected: true })
    expect(result.parts).toBe(parts)
  })

  test('switching event type re-sorts without reading the photos again', async () => {
    const { dir, emb } = await wedding()
    const session = await runSort(dir, { embedder: emb, parts })
    const calls = emb.imageCalls
    const other: Part[] = [{ id: 'confetti', name: 'Confetti', prompts: ['confetti'] }]
    const next = await reclassify(session, { embedder: emb, parts: other, event: { id: 'x', name: 'X', detected: false } })
    expect(emb.imageCalls).toBe(calls)
    expect(next.result.photos.every((p) => p.partId === 'confetti')).toBe(true)
    expect(next.result.event?.id).toBe('x')
    expect(next.result.photos).toHaveLength(5)
  })

  test('moments not on the list come back as suggestions', async () => {
    const { dir } = await wedding()
    const emb = new FakeEmbedder({
      ceremony: [1, 0, 0, 0], confetti: [0, 1, 0, 0], 'a photo of Fireworks': [0, 0, 1, 0],
      'AAA001.jpg': [0, 0.1, 1, 0], 'AAA002.jpg': [0, 0.1, 1, 0], 'AAA003.jpg': [0, 0.1, 1, 0],
      'BBB001.jpg': [0, 0.1, 1, 0], 'BBB002.jpg': [0, 0.1, 1, 0]
    })
    // Five similar photos within 20 minutes of each other on one camera's clock (B is 9 hours off, so use only A's)
    const { result } = await runSort(dir, { embedder: emb, parts, vocab: ['Fireworks'] })
    expect(result.moments?.map((m) => m.name)).toEqual([])
    const r2 = await runSort(dir, { embedder: emb, parts, vocab: ['Fireworks'], minMomentPhotos: 3 })
    expect(r2.result.moments?.[0].name).toBe('Fireworks')
  })
})
