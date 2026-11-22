import { describe, expect, test } from 'vitest'
import { mergeCameras } from '../../src/main/core/merge'
import { normalise } from '../../src/main/core/embed'
import type { Camera, Part, PhotoFile } from '../../src/main/core/types'

const parts: Part[] = [
  { id: 'p0', name: 'P0', prompts: [] },
  { id: 'p1', name: 'P1', prompts: [] }
]
const basis = (i: number) => {
  const v = new Float32Array(8).fill(0.05)
  v[i] = 1
  return normalise(v)
}
const ph = (name: string, captureMs?: number): PhotoFile => ({ path: `/x/${name}`, name, size: 1, captureMs })
const cam = (id: string, photos: PhotoFile[]): Camera => ({ id, label: id, photos, timed: photos.every((p) => p.captureMs !== undefined) })

function run(cameras: Camera[], partOf: Record<string, number>, embs: Record<string, Float32Array> = {}, offsets: Record<string, number> = {}, partOrder = ['p0', 'p1']) {
  return mergeCameras({
    cameras,
    partOf: new Map(Object.entries(partOf).map(([k, v]) => [`/x/${k}`, v])),
    offsets: new Map(Object.entries(offsets)),
    embs: new Map(Object.entries(embs).map(([k, v]) => [`/x/${k}`, v])),
    partOrder,
    parts
  }).map((p) => p.name)
}

describe('mergeCameras', () => {
  test('timed cameras interleave by corrected time within a part', () => {
    const a = cam('A', [ph('a1', 1000), ph('a2', 3000)])
    const b = cam('B', [ph('b1', 2000 - 500), ph('b2', 4000 - 500)])
    expect(run([a, b], { a1: 0, a2: 0, b1: 0, b2: 0 }, {}, { B: 500 })).toEqual(['a1', 'b1', 'a2', 'b2'])
  })

  test('untimed camera keeps its own order and slots next to its most similar timed photo', () => {
    const a = cam('A', [ph('a1', 1), ph('a2', 2), ph('a3', 3)])
    const b = cam('B', [ph('b1'), ph('b2')])
    const embs = { a1: basis(1), a2: basis(2), a3: basis(3), b1: basis(1), b2: basis(3) }
    expect(run([a, b], { a1: 0, a2: 0, a3: 0, b1: 0, b2: 0 }, embs)).toEqual(['a1', 'b1', 'a2', 'a3', 'b2'])
  })

  test('untimed anchors never go backwards', () => {
    const a = cam('A', [ph('a1', 1), ph('a2', 2), ph('a3', 3)])
    const b = cam('B', [ph('b1'), ph('b2')])
    const embs = { a1: basis(1), a2: basis(2), a3: basis(3), b1: basis(3), b2: basis(1) }
    expect(run([a, b], { a1: 0, a2: 0, a3: 0, b1: 0, b2: 0 }, embs)).toEqual(['a1', 'a2', 'a3', 'b1', 'b2'])
  })

  test('part with no timed photos interleaves cameras by relative position', () => {
    const a = cam('A', [ph('a1'), ph('a2'), ph('a3'), ph('a4')])
    const b = cam('B', [ph('b1'), ph('b2')])
    expect(run([a, b], { a1: 0, a2: 0, a3: 0, a4: 0, b1: 0, b2: 0 })).toEqual(['a1', 'b1', 'a2', 'a3', 'b2', 'a4'])
  })

  test('parts appear in partOrder', () => {
    const a = cam('A', [ph('a1', 1), ph('a2', 2)])
    expect(run([a], { a1: 0, a2: 1 }, {}, {}, ['p1', 'p0'])).toEqual(['a2', 'a1'])
  })

  test('identical times break ties by file number then name', () => {
    const a = cam('A', [ph('X10', 5)])
    const b = cam('B', [ph('Y2', 5), ph('Y2-1', 5)])
    expect(run([a, b], { X10: 0, Y2: 0, 'Y2-1': 0 })).toEqual(['Y2', 'Y2-1', 'X10'])
  })

  test('sets partId and correctedMs', () => {
    const a = cam('A', [ph('a1', 1000)])
    const out = mergeCameras({ cameras: [a], partOf: new Map([['/x/a1', 1]]), offsets: new Map([['A', 10]]), embs: new Map(), partOrder: ['p0', 'p1'], parts })
    expect(out[0]).toMatchObject({ partId: 'p1', correctedMs: 1010, cameraId: 'A', unsure: false })
  })
})
