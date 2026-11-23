import { expect, test } from 'vitest'
import { partColour, textOn } from '../../src/renderer/format'

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

test('parts are coloured along the light of the day: the first is dawn gold, the last is night blue', () => {
  expect(partColour(0, 15)).toBe('#e9c98e')
  expect(partColour(14, 15)).toBe('#3f4a78')
  const b = (hex: string) => parseInt(hex.slice(5, 7), 16) - parseInt(hex.slice(1, 3), 16)
  expect(b(partColour(14, 15))).toBeGreaterThan(b(partColour(0, 15)))
})

test('colours are spread over however many parts there are, and stay valid hex', () => {
  for (const total of [1, 2, 5, 15, 30]) {
    const cs = Array.from({ length: total }, (_, i) => partColour(i, total))
    for (const c of cs) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    if (total > 1) expect(new Set(cs).size).toBe(total)
  }
  expect(partColour(-1, 5)).toMatch(/^#[0-9a-f]{6}$/)
})

test('label text on every part colour is readable (WCAG 4.5:1), however many parts there are', () => {
  for (let total = 1; total <= 30; total++) {
    for (let i = 0; i < total; i++) {
      const c = partColour(i, total)
      expect(contrast(c, textOn(c))).toBeGreaterThanOrEqual(4.5)
    }
  }
})
