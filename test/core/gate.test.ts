import { expect, test } from 'vitest'
import { canSave, FREE_PHOTO_LIMIT } from '../../src/main/core/licence'

test('free limit is 250', () => expect(FREE_PHOTO_LIMIT).toBe(250))
test('250 single unlicensed ok', () => expect(canSave(250, 'single', false)).toEqual({ ok: true }))
test('251 single unlicensed is blocked by the limit', () => expect(canSave(251, 'single', false)).toEqual({ ok: false, reason: 'limit' }))
test('perPart unlicensed is locked', () => expect(canSave(10, 'perPart', false)).toEqual({ ok: false, reason: 'perPartLocked' }))
test('licensed always ok', () => {
  expect(canSave(5000, 'single', true)).toEqual({ ok: true })
  expect(canSave(5000, 'perPart', true)).toEqual({ ok: true })
})
