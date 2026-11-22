import { expect, test } from 'vitest'
import { addCorrection, applyCorrections, MAX_CORRECTIONS } from '../../src/main/core/corrections'
import { normalise } from '../../src/main/core/embed'
import type { Part } from '../../src/main/core/types'

const parts: Part[] = [
  { id: 'signing', name: 'Signing', prompts: [] },
  { id: 'ceremony', name: 'Ceremony', prompts: [] }
]
const v = (...x: number[]) => normalise(Float32Array.from(x))

test('a near-identical corrected photo flips the argmax', () => {
  const set = addCorrection([], v(1, 0, 0), 'ceremony')
  const [row] = applyCorrections([[0.6, 0.4]], [v(1, 0.05, 0)], set, parts)
  expect(row[1]).toBeGreaterThan(row[0])
  expect(row[0] + row[1]).toBeCloseTo(1, 6)
})

test('dissimilar corrections change nothing', () => {
  const set = addCorrection([], v(0, 1, 0), 'ceremony')
  expect(applyCorrections([[0.6, 0.4]], [v(1, 0, 0)], set, parts)).toEqual([[0.6, 0.4]])
})

test('cap drops oldest', () => {
  let set = addCorrection([], v(1, 0, 0), 'signing')
  for (let i = 0; i < MAX_CORRECTIONS; i++) set = addCorrection(set, v(0, 1, 0), 'ceremony')
  expect(set).toHaveLength(MAX_CORRECTIONS)
  expect(set.every((c) => c.partId === 'ceremony')).toBe(true)
})

test('unknown partId (part deleted) is ignored', () => {
  const set = addCorrection([], v(1, 0, 0), 'gone')
  expect(applyCorrections([[0.6, 0.4]], [v(1, 0, 0)], set, parts)).toEqual([[0.6, 0.4]])
})
