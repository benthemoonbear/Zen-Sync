import { cosine } from './embed'
import type { Camera, ClockSuggestion, PhotoFile } from './types'

export const SAME_MOMENT_SIM = 0.92
export const MIN_PAIRS = 2
export const MIN_OFFSET_MS = 120_000
export const AGREE_MS = 60_000
/** Cameras whose clocks read more than this behind the newest camera are treated as reset, never as the reference. */
const PLAUSIBLE_WINDOW_MS = 30 * 24 * 3_600_000

type Timed = PhotoFile & { captureMs: number }

const timedPhotos = (c: Camera): Timed[] => c.photos.filter((p): p is Timed => p.captureMs !== undefined)

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor((s.length - 1) / 2)]
}

/**
 * Finds cameras whose clock disagrees with a reference camera, by matching near-identical
 * photos of the same moment across cameras. Offsets are what to ADD to that camera's times.
 * The reference is the camera with the most timed photos among those whose clock isn't
 * obviously reset (months or years behind the newest camera).
 */
export function findClockOffsets(cameras: Camera[], embs: Map<string, Float32Array>): ClockSuggestion[] {
  const withTimes = cameras.map((c) => ({ c, t: timedPhotos(c) })).filter((x) => x.t.length > 0)
  if (withTimes.length < 2) return []

  const medians = new Map(withTimes.map((x) => [x.c.id, median(x.t.map((p) => p.captureMs))]))
  const latest = Math.max(...medians.values())
  const plausible = withTimes.filter((x) => medians.get(x.c.id)! >= latest - PLAUSIBLE_WINDOW_MS)
  const ref = [...plausible].sort((a, b) => b.t.length - a.t.length || a.c.id.localeCompare(b.c.id))[0]

  const out: ClockSuggestion[] = []
  for (const other of withTimes) {
    if (other === ref || !other.c.timed) continue
    const [few, many, sign] = other.t.length <= ref.t.length ? [other.t, ref.t, 1] : [ref.t, other.t, -1]
    const offsets: number[] = []
    for (const p of few) {
      const pe = embs.get(p.path)
      if (!pe) continue
      let best: Timed | undefined
      let bestSim = -Infinity
      for (const q of many) {
        const qe = embs.get(q.path)
        if (!qe) continue
        const s = cosine(pe, qe)
        if (s > bestSim) {
          bestSim = s
          best = q
        }
      }
      if (best && bestSim >= SAME_MOMENT_SIM) offsets.push(sign * (best.captureMs - p.captureMs))
    }
    if (!offsets.length) continue
    const m = median(offsets)
    const agreeing = offsets.filter((o) => Math.abs(o - m) <= AGREE_MS).length
    const needed = Math.min(MIN_PAIRS, few.length)
    if (agreeing >= needed && Math.abs(m) >= MIN_OFFSET_MS) out.push({ cameraId: other.c.id, offsetMs: m, pairs: agreeing })
  }
  return out
}
