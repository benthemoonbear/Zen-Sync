import { cosine } from './embed'
import type { Part } from './types'

export type CorrectionSet = { emb: number[]; partId: string }[]

export const MAX_CORRECTIONS = 5000
export const CORRECTION_SIM = 0.9

export function addCorrection(set: CorrectionSet, emb: Float32Array, partId: string): CorrectionSet {
  const next = [...set, { emb: Array.from(emb), partId }]
  return next.length > MAX_CORRECTIONS ? next.slice(next.length - MAX_CORRECTIONS) : next
}

/**
 * Pulls each photo's part scores towards the part the user chose for the most similar photo
 * they corrected before. Weight rises from 0.5 at similarity 0.9 to 1.0 for an identical photo.
 */
export function applyCorrections(scores: number[][], images: Float32Array[], set: CorrectionSet, parts: Part[]): number[][] {
  const usable = set
    .map((c) => ({ emb: Float32Array.from(c.emb), part: parts.findIndex((p) => p.id === c.partId) }))
    .filter((c) => c.part >= 0)
  if (!usable.length) return scores
  return scores.map((row, i) => {
    let best = -1
    let bestSim = -Infinity
    usable.forEach((c, k) => {
      const s = cosine(images[i], c.emb)
      if (s > bestSim) {
        bestSim = s
        best = k
      }
    })
    if (bestSim < CORRECTION_SIM) return row
    const w = 0.5 + 0.5 * Math.min(1, (bestSim - CORRECTION_SIM) / (1 - CORRECTION_SIM))
    return row.map((p, j) => (1 - w) * p + (j === usable[best].part ? w : 0))
  })
}
