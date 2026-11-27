import { expect, test } from 'vitest'
import { boxFrom, pathsInBox } from '../../src/renderer/marquee'

const r = (x: number, y: number, w = 100, h = 66) => ({ left: x, top: y, right: x + w, bottom: y + h })

test('a box drawn in any direction is normalised', () => {
  expect(boxFrom({ x: 300, y: 200 }, { x: 100, y: 50 })).toEqual({ left: 100, top: 50, right: 300, bottom: 200 })
})

test('photos the box touches are selected, in on-screen order', () => {
  const tiles = [
    { path: 'a', rect: r(0, 0) },
    { path: 'b', rect: r(110, 0) },
    { path: 'c', rect: r(220, 0) },
    { path: 'd', rect: r(0, 80) }
  ]
  expect(pathsInBox(boxFrom({ x: 150, y: 10 }, { x: 230, y: 30 }), tiles)).toEqual(['b', 'c'])
  expect(pathsInBox(boxFrom({ x: 50, y: 50 }, { x: 60, y: 90 }), tiles)).toEqual(['a', 'd'])
  expect(pathsInBox(boxFrom({ x: 103, y: 0 }, { x: 107, y: 200 }), tiles)).toEqual([])
})
