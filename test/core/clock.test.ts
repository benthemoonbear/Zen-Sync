import { describe, expect, test } from 'vitest'
import { findClockOffsets } from '../../src/main/core/clock'
import { normalise } from '../../src/main/core/embed'
import type { Camera, PhotoFile } from '../../src/main/core/types'

const H = 3_600_000
const OFFSET = 8 * H + 35 * 60_000
const T0 = Date.UTC(2026, 10, 7, 11, 47)

function basis(i: number, dim = 16): Float32Array {
  const v = new Float32Array(dim).fill(0.05)
  v[i % dim] = 1
  return normalise(v)
}

function cam(id: string, photos: PhotoFile[]): Camera {
  return { id, label: id, photos, timed: photos.every((p) => p.captureMs !== undefined) }
}

function photo(name: string, captureMs?: number): PhotoFile {
  return { path: `/x/${name}`, name, size: 1, captureMs }
}

describe('findClockOffsets', () => {
  test('reference camera is the timed camera with most photos; it gets no suggestion', () => {
    const a = cam('A', [photo('a1', T0), photo('a2', T0 + 60_000), photo('a3', T0 + 120_000)])
    const b = cam('B', [photo('b1', T0 - OFFSET), photo('b2', T0 + 60_000 - OFFSET)])
    const embs = new Map([['/x/a1', basis(1)], ['/x/a2', basis(2)], ['/x/a3', basis(3)], ['/x/b1', basis(1)], ['/x/b2', basis(2)]])
    const s = findClockOffsets([b, a], embs)
    expect(s.map((x) => x.cameraId)).toEqual(['B'])
  })

  test('detects 8h35m offset', () => {
    const a = cam('A', [1, 2, 3, 4].map((i) => photo(`a${i}`, T0 + i * 60_000)))
    const b = cam('B', [1, 2, 3].map((i) => photo(`b${i}`, T0 + i * 60_000 + 5_000 - OFFSET)))
    const embs = new Map<string, Float32Array>()
    for (let i = 1; i <= 4; i++) embs.set(`/x/a${i}`, basis(i))
    for (let i = 1; i <= 3; i++) embs.set(`/x/b${i}`, basis(i))
    const [s] = findClockOffsets([a, b], embs)
    expect(s.cameraId).toBe('B')
    expect(Math.abs(s.offsetMs - OFFSET)).toBeLessThanOrEqual(60_000)
    expect(s.pairs).toBe(3)
  })

  test('no suggestion when fewer than MIN_PAIRS agree or offset under 2 minutes', () => {
    const a = cam('A', [1, 2, 3].map((i) => photo(`a${i}`, T0 + i * 60_000)))
    const disagree = cam('B', [photo('b1', T0 + 60_000 - OFFSET), photo('b2', T0 + 120_000 - 2 * OFFSET)])
    const small = cam('C', [photo('c1', T0 + 60_000 - 60_000), photo('c2', T0 + 120_000 - 60_000)])
    const embs = new Map<string, Float32Array>([
      ['/x/a1', basis(1)], ['/x/a2', basis(2)], ['/x/a3', basis(3)],
      ['/x/b1', basis(1)], ['/x/b2', basis(2)], ['/x/c1', basis(1)], ['/x/c2', basis(2)]
    ])
    expect(findClockOffsets([a, disagree], embs)).toEqual([])
    expect(findClockOffsets([a, small], embs)).toEqual([])
  })

  test('untimed cameras are ignored', () => {
    const a = cam('A', [photo('a1', T0), photo('a2', T0 + 60_000)])
    const b = cam('B', [photo('b1'), photo('b2')])
    const embs = new Map([['/x/a1', basis(1)], ['/x/a2', basis(2)], ['/x/b1', basis(1)], ['/x/b2', basis(2)]])
    expect(findClockOffsets([a, b], embs)).toEqual([])
  })

  test('a reset clock (years behind) is the one corrected, even with more photos', () => {
    const reset = cam('A7R', [1, 2, 3, 4, 5].map((i) => photo(`r${i}`, Date.UTC(2015, 0, 1, 3, 10 + i))))
    const good = cam('FX3', [photo('f1'), photo('f2'), photo('f3', Date.UTC(2015, 0, 1, 3, 15) + Date.UTC(2026, 10, 7, 12, 33) - Date.UTC(2015, 0, 1, 3, 15))])
    const embs = new Map<string, Float32Array>()
    for (let i = 1; i <= 5; i++) embs.set(`/x/r${i}`, basis(i))
    embs.set('/x/f1', basis(9)); embs.set('/x/f2', basis(10)); embs.set('/x/f3', basis(5))
    const [s] = findClockOffsets([reset, good], embs)
    expect(s.cameraId).toBe('A7R')
    expect(s.pairs).toBe(1)
    expect(Math.abs(s.offsetMs - (Date.UTC(2026, 10, 7, 12, 33) - Date.UTC(2015, 0, 1, 3, 15)))).toBeLessThanOrEqual(60_000)
  })
})
