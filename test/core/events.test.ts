import { expect, test } from 'vitest'
import { DEFAULT_EVENT, EVENT_TYPES, eventById, partsForSort, promptsFor } from '../../src/main/core/events'
import { DEFAULT_PARTS } from '../../src/main/core/parts'

test('event types start with weddings and include other kinds of shoot', () => {
  expect(DEFAULT_EVENT).toBe('wedding')
  expect(EVENT_TYPES.map((e) => e.id)).toEqual(['wedding', 'corporate', 'party', 'christening', 'engagement'])
  expect(eventById('wedding').parts).toBe(DEFAULT_PARTS)
  expect(eventById('nope').id).toBe('wedding')
})

test('every preset part has prompts and an id unique within its event', () => {
  for (const ev of EVENT_TYPES) {
    expect(ev.parts.length).toBeGreaterThanOrEqual(4)
    expect(new Set(ev.parts.map((p) => p.id)).size).toBe(ev.parts.length)
    for (const p of ev.parts) expect(p.prompts.length).toBeGreaterThanOrEqual(2)
  }
})

test('wedding parts come grouped into Morning, Ceremony, Reception and Evening', () => {
  const groups = [...new Set(DEFAULT_PARTS.map((p) => p.group))]
  expect(groups).toEqual(['Morning', 'Ceremony', 'Reception', 'Evening'])
})

test('a part with no prompts is described from its name', () => {
  expect(promptsFor({ id: 'x', name: '  Sparklers ', prompts: [] })).toEqual([
    'a photo of sparklers',
    'a photo of sparklers at an event'
  ])
  expect(promptsFor({ id: 'y', name: 'Ceremony', prompts: ['keep me'] })).toEqual(['keep me'])
})

test('a nameless, promptless part still gets a usable prompt', () => {
  expect(promptsFor({ id: 'z', name: '', prompts: [] })).toEqual(['a photo at an event'])
})

test('partsForSort fills in missing prompts and leaves the rest alone', () => {
  const out = partsForSort([{ id: 'a', name: 'Fireworks', prompts: [] }, DEFAULT_PARTS[0]])
  expect(out[0].prompts[0]).toBe('a photo of fireworks')
  expect(out[1]).toBe(DEFAULT_PARTS[0])
})
