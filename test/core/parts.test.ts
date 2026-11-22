import { expect, test } from 'vitest'
import { DEFAULT_PARTS } from '../../src/main/core/parts'

test('DEFAULT_PARTS names match the spec order', () => {
  expect(DEFAULT_PARTS.map((p) => p.name)).toEqual([
    'Getting ready', 'Details', 'Arrival and guests', 'Ceremony', 'Signing', 'Confetti',
    'Drinks reception', 'Groups and family', 'Couple portraits', 'Venue and breakfast setup',
    'Wedding breakfast', 'Speeches', 'Cake cutting', 'First dance', 'Evening party'
  ])
})

test('every part has at least 3 prompts and a unique id; only details floats', () => {
  for (const p of DEFAULT_PARTS) expect(p.prompts.length).toBeGreaterThanOrEqual(3)
  expect(new Set(DEFAULT_PARTS.map((p) => p.id)).size).toBe(DEFAULT_PARTS.length)
  expect(DEFAULT_PARTS.filter((p) => p.floating).map((p) => p.id)).toEqual(['details'])
})
