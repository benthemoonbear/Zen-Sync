import type { SaveMode } from './types'

export const FREE_PHOTO_LIMIT = 250

export type SaveCheck = { ok: true } | { ok: false; reason: 'limit' | 'perPartLocked' }

/** Free version: sort and preview anything; save one folder of up to 250 photos. */
export function canSave(count: number, mode: SaveMode, licensed: boolean): SaveCheck {
  if (licensed) return { ok: true }
  if (mode === 'perPart') return { ok: false, reason: 'perPartLocked' }
  if (count > FREE_PHOTO_LIMIT) return { ok: false, reason: 'limit' }
  return { ok: true }
}
