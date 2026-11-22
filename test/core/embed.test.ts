import { describe, expect, test } from 'vitest'
import { join } from 'node:path'
import sharp from 'sharp'
import { cosine, createSiglipEmbedder, normalise } from '../../src/main/core/embed'
import { FakeEmbedder } from '../fakes/fakeEmbedder'
import { tempDir } from '../helpers/jpeg'

describe('embed helpers', () => {
  test('cosine of identical vectors is 1, orthogonal 0', () => {
    const a = normalise(Float32Array.from([1, 2, 3]))
    expect(cosine(a, a)).toBeCloseTo(1, 6)
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([0, 1]))).toBe(0)
  })

  test('embeddings are L2-normalised', async () => {
    const [v] = await new FakeEmbedder({ 'a.jpg': [3, 4, 0, 0] }).embedImages(['/x/a.jpg'])
    expect(Math.hypot(...v)).toBeCloseTo(1, 6)
    expect(v[0]).toBeCloseTo(0.6, 6)
  })
})

describe.runIf(process.env.RUN_MODEL_TESTS === '1')('siglip', () => {
  test('image of a red square is closer to "a red square" than "a blue circle"', async () => {
    const dir = await tempDir()
    const p = join(dir, 'red.jpg')
    await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 220, g: 20, b: 20 } } }).jpeg().toFile(p)
    const e = await createSiglipEmbedder(join(dir, 'models'))
    const [img] = await e.embedImages([p])
    const [red, blue] = await e.embedTexts(['a photo of a red square', 'a photo of a blue circle'])
    expect(cosine(img, red)).toBeGreaterThan(cosine(img, blue))
  }, 600_000)
})
