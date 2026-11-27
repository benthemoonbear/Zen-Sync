import { describe, expect, test } from 'vitest'
import { normalise } from '../../src/main/core/embed'
import { pickEvent } from '../../src/main/core/detect'
import { findMoments } from '../../src/main/core/moments'

const v = (...xs: number[]) => normalise(Float32Array.from(xs))
const MIN = 60_000

describe('detecting the type of event', () => {
  const events = [
    { id: 'wedding', emb: v(1, 0, 0) },
    { id: 'corporate', emb: v(0, 1, 0) },
    { id: 'party', emb: v(0, 0, 1) }
  ]

  test('picks the event the photos look most like overall', () => {
    const photos = [v(0.2, 1, 0), v(0.1, 0.9, 0.2), v(1, 0.3, 0)]
    const r = pickEvent(photos, events)
    expect(r.id).toBe('corporate')
    expect(r.ranked.map((x) => x.id)).toEqual(['corporate', 'wedding', 'party'])
  })

  test('says when it is a close call', () => {
    const r = pickEvent([v(1, 1, 0)], events)
    expect(r.confident).toBe(false)
    expect(pickEvent([v(1, 0, 0), v(1, 0.1, 0)], events).confident).toBe(true)
  })
})

describe('finding moments that are not on the list', () => {
  // Known parts point along x and y; a fireworks-like cluster points along z.
  const parts = [{ id: 'drinks', emb: v(1, 0, 0, 0) }, { id: 'dancing', emb: v(0, 1, 0, 0) }]
  const vocab = [{ name: 'Fireworks', emb: v(0, 0, 1, 0) }, { name: 'Ceilidh', emb: v(0, 0, 0, 1) }, { name: 'First dance', emb: v(0, 1, 0, 0.1) }]
  const photo = (i: number, min: number, emb: Float32Array, partId = 'dancing') => ({ path: `/w/${i}.jpg`, ms: min * MIN, emb, partId })

  const day = [
    ...Array.from({ length: 10 }, (_, i) => photo(i, 600 + i, v(1, 0.1, 0, 0), 'drinks')),
    ...Array.from({ length: 6 }, (_, i) => photo(20 + i, 1300 + i, v(0.1, 0.1, 1, 0))), // fireworks at 21:40
    ...Array.from({ length: 10 }, (_, i) => photo(40 + i, 1320 + i, v(0, 1, 0.1, 0)))
  ]

  test('a run of similar photos that fit no part well becomes a named suggestion, placed in the day', () => {
    const found = findMoments(day, parts, vocab)
    expect(found).toHaveLength(1)
    expect(found[0].name).toBe('Fireworks')
    expect(found[0].paths).toEqual(day.slice(10, 16).map((p) => p.path))
    expect(found[0].afterPartId).toBe('drinks')
  })

  test('too few photos are not a moment', () => {
    expect(findMoments([...day.slice(0, 10), ...day.slice(10, 12), ...day.slice(16)], parts, vocab)).toEqual([])
  })

  test('photos spread far apart in time are not one moment', () => {
    const spread = day.map((p, i) => (i >= 10 && i < 16 ? { ...p, ms: (700 + (i - 10) * 60) * MIN } : p))
    expect(findMoments(spread, parts, vocab)).toEqual([])
  })

  test('a name the job already has is not suggested again', () => {
    expect(findMoments(day, [...parts, { id: 'fw', emb: v(0, 0, 1, 0), name: 'Fireworks' }], vocab)).toEqual([])
  })

  test('photos with no capture time are left alone', () => {
    expect(findMoments(day.map((p) => ({ ...p, ms: undefined })), parts, vocab)).toEqual([])
  })
})
