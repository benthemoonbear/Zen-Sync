import type { Part, SortedPhoto } from '../../main/core/types'

function split(photos: SortedPhoto[], paths: string[]) {
  const set = new Set(paths)
  return { moved: photos.filter((p) => set.has(p.path)), rest: photos.filter((p) => !set.has(p.path)) }
}

/**
 * Moves photos (keeping their relative order) to a position in the strip. toIndex is the
 * insertion point in the current list. They take the part of the photo they land after,
 * or the one they land before when dropped at the very start.
 */
export function movePhotos(photos: SortedPhoto[], paths: string[], toIndex: number): SortedPhoto[] {
  const { moved, rest } = split(photos, paths)
  if (!moved.length) return photos
  const movedBefore = photos.slice(0, toIndex).filter((p) => paths.includes(p.path)).length
  const at = Math.max(0, Math.min(rest.length, toIndex - movedBefore))
  const neighbour = at > 0 ? rest[at - 1] : rest[0]
  const partId = neighbour?.partId ?? moved[0].partId
  return [...rest.slice(0, at), ...moved.map((p) => ({ ...p, partId })), ...rest.slice(at)]
}

/** Moves photos to the end of a part (or where that part would be, if it's empty). */
export function movePhotosToPart(photos: SortedPhoto[], paths: string[], partId: string, partOrder: string[]): SortedPhoto[] {
  const { moved, rest } = split(photos, paths)
  if (!moved.length) return photos
  const rank = (id: string) => {
    const i = partOrder.indexOf(id)
    return i < 0 ? partOrder.length : i
  }
  const target = rank(partId)
  let at = rest.length
  for (let i = 0; i < rest.length; i++) {
    if (rank(rest[i].partId) > target) {
      at = i
      break
    }
  }
  return [...rest.slice(0, at), ...moved.map((p) => ({ ...p, partId })), ...rest.slice(at)]
}

export function moveSection(partOrder: string[], partId: string, toIndex: number): string[] {
  const rest = partOrder.filter((id) => id !== partId)
  if (rest.length === partOrder.length) return partOrder
  const at = Math.max(0, Math.min(rest.length, toIndex))
  return [...rest.slice(0, at), partId, ...rest.slice(at)]
}

/** Stable regroup of photos by the part order. */
export function orderByParts(photos: SortedPhoto[], partOrder: string[]): SortedPhoto[] {
  const rank = new Map(partOrder.map((id, i) => [id, i]))
  return photos
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (rank.get(a.p.partId) ?? Infinity) - (rank.get(b.p.partId) ?? Infinity) || a.i - b.i)
    .map((x) => x.p)
}

export function insertPartBetween(
  partOrder: string[],
  parts: Part[],
  afterPartId: string | null,
  name: string
): { partOrder: string[]; parts: Part[]; newId: string } {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'part'
  let newId = `custom-${slug}`
  for (let n = 2; partOrder.includes(newId) || parts.some((p) => p.id === newId); n++) newId = `custom-${slug}-${n}`
  const at = afterPartId === null ? 0 : partOrder.indexOf(afterPartId) + 1
  return {
    partOrder: [...partOrder.slice(0, at), newId, ...partOrder.slice(at)],
    parts: [...parts, { id: newId, name, prompts: [] }],
    newId
  }
}

export function numberOf(photos: SortedPhoto[], path: string): number {
  return photos.findIndex((p) => p.path === path) + 1
}

export function sectionSizes(photos: SortedPhoto[], partOrder: string[]): { partId: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const p of photos) counts.set(p.partId, (counts.get(p.partId) ?? 0) + 1)
  return partOrder.filter((id) => counts.get(id)).map((partId) => ({ partId, count: counts.get(partId)! }))
}

export function nextUnsure(photos: SortedPhoto[], fromPath: string | null): string | null {
  if (!photos.some((p) => p.unsure)) return null
  const start = fromPath ? photos.findIndex((p) => p.path === fromPath) + 1 : 0
  for (let k = 0; k < photos.length; k++) {
    const p = photos[(start + k) % photos.length]
    if (p.unsure) return p.path
  }
  return null
}
