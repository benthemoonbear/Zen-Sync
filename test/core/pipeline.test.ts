import { describe, expect, test } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { applyClockFix, runSort } from '../../src/main/core/pipeline'
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
