import { describe, expect, test } from 'vitest'
import { placeNewPhotos } from '../../src/main/core/sync'
import type { SortedPhoto } from '../../src/main/core/types'

const p = (name: string, partId: string, min?: number): SortedPhoto => ({
  path: `/w/${name}`, name, cameraId: 'c', partId, unsure: false, correctedMs: min === undefined ? undefined : min * 60_000
})
const names = (ps: SortedPhoto[]) => ps.map((x) => x.name)
const order = ['prep', 'ceremony', 'drinks', 'speeches']

describe('placing late photos into a saved job', () => {
  const job = [p('a', 'prep', 10), p('b', 'ceremony', 60), p('c', 'ceremony', 70), p('d', 'drinks', 100)]

  test('a late photo goes into its part, in capture-time order', () => {
    expect(names(placeNewPhotos(job, [p('new', 'ceremony', 65)], order))).toEqual(['a', 'b', 'new', 'c', 'd'])
  })

  test('the photographer’s own order is kept: nothing already placed moves', () => {
    const handMoved = [p('a', 'prep', 10), p('c', 'ceremony', 70), p('b', 'ceremony', 60), p('d', 'drinks', 100)]
    expect(names(placeNewPhotos(handMoved, [p('new', 'drinks', 101)], order))).toEqual(['a', 'c', 'b', 'd', 'new'])
  })

  test('a photo later than everything in its part goes at the end of that part', () => {
    expect(names(placeNewPhotos(job, [p('new', 'ceremony', 99)], order))).toEqual(['a', 'b', 'c', 'new', 'd'])
  })

  test('a photo for a part with nothing in it yet starts that part in the right place in the day', () => {
    expect(names(placeNewPhotos(job, [p('new', 'speeches', 200)], order))).toEqual(['a', 'b', 'c', 'd', 'new'])
    const noCeremony = [p('a', 'prep', 10), p('d', 'drinks', 100)]
    expect(names(placeNewPhotos(noCeremony, [p('new', 'ceremony', 60)], order))).toEqual(['a', 'new', 'd'])
  })

  test('a photo with no capture time goes at the end of its part', () => {
    expect(names(placeNewPhotos(job, [p('new', 'ceremony')], order))).toEqual(['a', 'b', 'c', 'new', 'd'])
  })

  test('several late photos land in time order among each other', () => {
    expect(names(placeNewPhotos(job, [p('y', 'ceremony', 67), p('x', 'ceremony', 62)], order))).toEqual(['a', 'b', 'x', 'y', 'c', 'd'])
  })

  test('a photo already in the job is not added twice', () => {
    expect(names(placeNewPhotos(job, [p('b', 'ceremony', 60)], order))).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('clock fixes on late photos', () => {
  test('a clock fix made during review is applied to that camera’s late photos', async () => {
    const { applyOffsets } = await import('../../src/main/core/sync')
    const late = [{ ...p('x', 'ceremony', 10), cameraId: 'slow' }, { ...p('y', 'ceremony', 10), cameraId: 'ok' }, { ...p('z', 'ceremony'), cameraId: 'slow' }]
    const fixed = applyOffsets(late, { slow: 60 * 60_000 })
    expect(fixed.map((f) => f.correctedMs)).toEqual([70 * 60_000, 10 * 60_000, undefined])
  })
})
