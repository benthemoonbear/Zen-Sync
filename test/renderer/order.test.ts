import { describe, expect, test } from 'vitest'
import {
  insertPartBetween, moveSection, movePhotos, movePhotosToPart, nextUnsure, numberOf, orderByParts, sectionSizes
} from '../../src/renderer/state/order'
import type { Part, SortedPhoto } from '../../src/main/core/types'

const ph = (name: string, partId: string, unsure = false): SortedPhoto => ({ path: `/x/${name}`, name, cameraId: 'c', partId, unsure })
const names = (ps: SortedPhoto[]) => ps.map((p) => `${p.name}:${p.partId}`)
const day = () => [ph('a', 'arrival'), ph('b', 'arrival'), ph('c', 'ceremony'), ph('d', 'ceremony'), ph('e', 'confetti')]
const order = ['arrival', 'ceremony', 'signing', 'confetti']

describe('movePhotos', () => {
  test('moves one photo and takes the part it lands after', () => {
    expect(names(movePhotos(day(), ['/x/e'], 1))).toEqual(['a:arrival', 'e:arrival', 'b:arrival', 'c:ceremony', 'd:ceremony'])
  })
  test('moving to the start takes the part of the photo it lands before', () => {
    expect(names(movePhotos(day(), ['/x/c'], 0))).toEqual(['c:arrival', 'a:arrival', 'b:arrival', 'd:ceremony', 'e:confetti'])
  })
  test('a multi-selection keeps its relative order', () => {
    expect(names(movePhotos(day(), ['/x/d', '/x/a'], 5))).toEqual(['b:arrival', 'c:ceremony', 'e:confetti', 'a:confetti', 'd:confetti'])
  })
})

describe('movePhotosToPart', () => {
  test('appends at the end of that part', () => {
    expect(names(movePhotosToPart(day(), ['/x/a'], 'ceremony', order))).toEqual(['b:arrival', 'c:ceremony', 'd:ceremony', 'a:ceremony', 'e:confetti'])
  })
  test('into an empty part goes before the next non-empty part', () => {
    expect(names(movePhotosToPart(day(), ['/x/d'], 'signing', order))).toEqual(['a:arrival', 'b:arrival', 'c:ceremony', 'd:signing', 'e:confetti'])
  })
})

describe('sections', () => {
  test('moveSection then orderByParts moves all its photos and numbering follows', () => {
    const newOrder = moveSection(order, 'confetti', 1)
    expect(newOrder).toEqual(['arrival', 'confetti', 'ceremony', 'signing'])
    const ps = orderByParts(day(), newOrder)
    expect(names(ps)).toEqual(['a:arrival', 'b:arrival', 'e:confetti', 'c:ceremony', 'd:ceremony'])
    expect(numberOf(ps, '/x/e')).toBe(3)
  })

  test('insertPartBetween + movePhotosToPart creates a "First look" section between Signing and Confetti', () => {
    const parts: Part[] = order.map((id) => ({ id, name: id, prompts: [] }))
    const r = insertPartBetween(order, parts, 'signing', 'First look')
    expect(r.partOrder).toEqual(['arrival', 'ceremony', 'signing', r.newId, 'confetti'])
    expect(r.parts.find((p) => p.id === r.newId)).toMatchObject({ name: 'First look', prompts: [] })
    const ps = movePhotosToPart(day(), ['/x/b'], r.newId, r.partOrder)
    expect(names(ps)).toEqual(['a:arrival', 'c:ceremony', 'd:ceremony', `b:${r.newId}`, 'e:confetti'])
  })

  test('insertPartBetween with null puts it first', () => {
    const r = insertPartBetween(order, [], null, 'Prep')
    expect(r.partOrder[0]).toBe(r.newId)
  })

  test('sectionSizes omits empty parts', () => {
    expect(sectionSizes(day(), order)).toEqual([
      { partId: 'arrival', count: 2 }, { partId: 'ceremony', count: 2 }, { partId: 'confetti', count: 1 }
    ])
  })
})

describe('nextUnsure', () => {
  const ps = [ph('a', 'x', true), ph('b', 'x'), ph('c', 'x', true), ph('d', 'x')]
  test('finds the next unsure photo after the current one', () => expect(nextUnsure(ps, '/x/a')).toBe('/x/c'))
  test('wraps to the first unsure', () => expect(nextUnsure(ps, '/x/c')).toBe('/x/a'))
  test('starts from the beginning with no current photo', () => expect(nextUnsure(ps, null)).toBe('/x/a'))
  test('null when nothing is unsure', () => expect(nextUnsure([ph('a', 'x')], null)).toBeNull())
})
