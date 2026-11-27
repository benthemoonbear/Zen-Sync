import type { Part, SaveMode, SortedClip, SortedPhoto } from './types'

/** A saved job Zen Sync keeps in sync: the arrangement as last saved, so late photos can join it. */
export interface Job {
  dir: string
  mode: SaveMode
  parts: Part[]
  photos: SortedPhoto[]
  savedAt: number
  /** Clock fixes made during review, per camera (ms), applied to late photos from those cameras */
  offsets?: Record<string, number>
  /** What to do with video clips in the folder (copy, timecode lists); clips are re-read on each sync */
  video?: { copy: boolean; timecode: boolean }
  /** Clips found when last saved */
  clips?: SortedClip[]
}

/**
 * Puts late photos into an existing arrangement without moving anything already there.
 * Each goes into its part by capture time (or at the end of the part if it has none); a part with nothing in it
 * yet starts at its place in the day. `partOrder` is the order of parts through the day.
 */
export function placeNewPhotos(photos: SortedPhoto[], added: SortedPhoto[], partOrder: string[]): SortedPhoto[] {
  const out = [...photos]
  const have = new Set(out.map((p) => p.path))
  const rank = (partId: string) => {
    const i = partOrder.indexOf(partId)
    return i < 0 ? partOrder.length : i
  }
  const byTime = [...added].sort((a, b) => (a.correctedMs ?? Infinity) - (b.correctedMs ?? Infinity))
  for (const photo of byTime) {
    if (have.has(photo.path)) continue
    have.add(photo.path)
    const same = out.map((p, i) => (p.partId === photo.partId ? i : -1)).filter((i) => i >= 0)
    let at: number
    if (same.length) {
      const later = photo.correctedMs === undefined ? -1 : same.find((i) => (out[i].correctedMs ?? -Infinity) > photo.correctedMs!) ?? -1
      at = later >= 0 ? later : same[same.length - 1] + 1
    } else {
      const next = out.findIndex((p) => rank(p.partId) > rank(photo.partId))
      at = next < 0 ? out.length : next
    }
    out.splice(at, 0, photo)
  }
  return out
}

/** Applies the clock fixes made during review (per camera, in ms) to late photos from the same cameras. */
export function applyOffsets(photos: SortedPhoto[], offsets: Record<string, number> = {}): SortedPhoto[] {
  return photos.map((p) =>
    p.correctedMs !== undefined && offsets[p.cameraId] ? { ...p, correctedMs: p.correctedMs + offsets[p.cameraId] } : p
  )
}
