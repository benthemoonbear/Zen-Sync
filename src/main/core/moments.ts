import { cosine, normalise } from './embed'

/** A run of photos needs at least this many to count as a moment. */
export const MOMENT_MIN_PHOTOS = 5
/** Photos further apart than this in time are not the same moment. */
export const MOMENT_GAP_MS = 15 * 60_000
/** How much more a photo must look like a moment name than like any part on the list. */
export const MOMENT_MARGIN = 0.02
/** How alike a moment's photos must be (mean similarity to their average). */
export const MOMENT_COHERENCE = 0.75
/** A moment name this close to a part already on the list counts as that part. */
const SAME_AS_PART = 0.9
/** At most this many suggestions per sort. */
const MAX_SUGGESTIONS = 3

export interface MomentPhoto {
  path: string
  ms?: number
  emb: Float32Array
  partId: string
}

export interface MomentSuggestion {
  name: string
  paths: string[]
  /** The part it belongs after in the day (null: at the start) */
  afterPartId: string | null
}

/**
 * Finds moments that aren't on the parts list: runs of photos taken close together that look alike and look
 * more like a known kind of moment (e.g. fireworks, a ceilidh) than like any part on the list.
 */
export function findMoments(
  photos: MomentPhoto[],
  parts: { id: string; emb: Float32Array; name?: string }[],
  vocab: { name: string; emb: Float32Array }[],
  minPhotos = MOMENT_MIN_PHOTOS
): MomentSuggestion[] {
  const taken = new Set(parts.map((p) => p.name?.toLowerCase()).filter(Boolean))
  const labels = vocab.filter(
    (l) => !taken.has(l.name.toLowerCase()) && !parts.some((p) => cosine(l.emb, p.emb) >= SAME_AS_PART)
  )
  if (!labels.length) return []

  const bestLabel = (emb: Float32Array) => {
    let best = { name: '', score: -Infinity }
    for (const l of labels) {
      const s = cosine(emb, l.emb)
      if (s > best.score) best = { name: l.name, score: s }
    }
    return best
  }
  const bestPart = (emb: Float32Array) => Math.max(...parts.map((p) => cosine(emb, p.emb)))

  const timed = photos.filter((p) => p.ms !== undefined).sort((a, b) => a.ms! - b.ms!)
  const isCandidate = new Map(timed.map((p) => [p.path, bestLabel(p.emb).score - bestPart(p.emb) > MOMENT_MARGIN]))

  // Runs of candidates taken close together.
  const runs: MomentPhoto[][] = []
  let run: MomentPhoto[] = []
  for (const p of timed) {
    if (!isCandidate.get(p.path)) continue
    if (run.length && p.ms! - run[run.length - 1].ms! > MOMENT_GAP_MS) {
      runs.push(run)
      run = []
    }
    run.push(p)
  }
  if (run.length) runs.push(run)

  const found: (MomentSuggestion & { strength: number })[] = []
  for (const r of runs) {
    if (r.length < minPhotos) continue
    const centroid = normalise(r.reduce((sum, p) => (p.emb.forEach((x, d) => (sum[d] += x)), sum), new Float32Array(r[0].emb.length)))
    const coherence = r.reduce((s, p) => s + cosine(p.emb, centroid), 0) / r.length
    if (coherence < MOMENT_COHERENCE) continue
    const label = bestLabel(centroid)
    const margin = label.score - bestPart(centroid)
    if (margin <= MOMENT_MARGIN || found.some((f) => f.name === label.name)) continue
    const before = timed.filter((p) => p.ms! < r[0].ms! && !isCandidate.get(p.path)).at(-1)
    found.push({ name: label.name, paths: r.map((p) => p.path), afterPartId: before?.partId ?? null, strength: margin * r.length })
  }
  return found
    .sort((a, b) => b.strength - a.strength)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ strength: _, ...m }) => m)
}
