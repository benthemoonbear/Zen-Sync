import { expect, test } from 'vitest'
import { clockText, timeOfDay } from '../../src/renderer/format'

const M = 60_000
test('clock offsets read naturally', () => {
  expect(clockText('A7R', (8 * 60 + 35) * M)).toBe('A7R clock looks 8h 35m slow')
  expect(clockText('A7R', -45 * M)).toBe('A7R clock looks 45m fast')
  expect(clockText('A7R', 3 * 24 * 60 * M)).toBe('A7R clock looks 3 days slow')
  expect(clockText('A7R', 4300 * 24 * 60 * M)).toBe('A7R clock looks about 12 years slow')
})
test('timeOfDay formats the naive capture time', () => {
  expect(timeOfDay(Date.UTC(2026, 10, 7, 9, 5))).toBe('09:05')
  expect(timeOfDay(undefined)).toBe('')
})
