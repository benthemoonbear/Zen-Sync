import { expect, test } from 'vitest'
import { assignMonotonic } from '../../src/main/core/smooth'

test('assignMonotonic never decreases for non-floating photos', () => {
  const scores = [
    [0.9, 0.05, 0.03, 0.02],
    [0.05, 0.05, 0.85, 0.05],
    [0.1, 0.5, 0.35, 0.05],
    [0.05, 0.05, 0.85, 0.05],
    [0.02, 0.03, 0.05, 0.9]
  ]
  expect(assignMonotonic(scores, [false, false, false, false])).toEqual([0, 2, 2, 2, 3])
})

test("assignMonotonic keeps a floating photo's own best part", () => {
  const scores = [
    [0.1, 0.1, 0.8],
    [0.1, 0.8, 0.1],
    [0.1, 0.1, 0.8]
  ]
  expect(assignMonotonic(scores, [false, true, false])).toEqual([2, 1, 2])
  const strict = assignMonotonic(scores, [false, false, false])
  expect(strict).not.toEqual([2, 1, 2])
  for (let i = 1; i < strict.length; i++) expect(strict[i]).toBeGreaterThanOrEqual(strict[i - 1])
})

test('a weak floating-part score does not make the photo float', () => {
  const scores = [
    [0.8, 0.1, 0.1],
    [0.1, 0.45, 0.45],
    [0.1, 0.1, 0.8]
  ]
  const out = assignMonotonic(scores, [false, true, false])
  expect(out[1]).not.toBe(1)
  expect(out).toEqual([0, 2, 2])
})
