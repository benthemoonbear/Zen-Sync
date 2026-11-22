import { expect, test } from 'vitest'
import { isUnsure, partTextEmbeddings, scoreParts } from '../../src/main/core/classify'
import { normalise } from '../../src/main/core/embed'
import { FakeEmbedder } from '../fakes/fakeEmbedder'
import type { Part } from '../../src/main/core/types'

const v = (...x: number[]) => normalise(Float32Array.from(x))

test('scoreParts rows sum to 1 and argmax matches nearest part', () => {
  const parts = [v(1, 0, 0), v(0, 1, 0), v(0, 0, 1)]
  const scores = scoreParts([v(0.1, 0.9, 0.1), v(0.9, 0.1, 0)], parts)
  for (const row of scores) expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
  expect(scores[0].indexOf(Math.max(...scores[0]))).toBe(1)
  expect(scores[1].indexOf(Math.max(...scores[1]))).toBe(0)
})

test('partTextEmbeddings averages each part prompt embeddings', async () => {
  const parts: Part[] = [{ id: 'a', name: 'A', prompts: ['p1', 'p2'] }]
  const e = new FakeEmbedder({ p1: [1, 0, 0, 0], p2: [0, 1, 0, 0] })
  const [emb] = await partTextEmbeddings(parts, e)
  expect(emb[0]).toBeCloseTo(Math.SQRT1_2, 5)
  expect(emb[1]).toBeCloseTo(Math.SQRT1_2, 5)
})

test('isUnsure is true for a close call, false for a clear winner', () => {
  expect(isUnsure([0.4, 0.35, 0.25])).toBe(true)
  expect(isUnsure([0.8, 0.1, 0.1])).toBe(false)
})
