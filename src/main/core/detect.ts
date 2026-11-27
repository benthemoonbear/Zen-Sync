import { cosine } from './embed'

/** How far ahead the best event type must be (mean similarity) to count as a confident pick. */
export const EVENT_MARGIN = 0.01

/**
 * Picks the type of event the photos look most like: the event whose description embedding has the highest
 * mean similarity to the photos.
 */
export function pickEvent(photos: Float32Array[], events: { id: string; emb: Float32Array }[]) {
  const ranked = events
    .map((e) => ({ id: e.id, score: photos.reduce((s, p) => s + cosine(p, e.emb), 0) / Math.max(1, photos.length) }))
    .sort((a, b) => b.score - a.score)
  const confident = ranked.length < 2 || ranked[0].score - ranked[1].score >= EVENT_MARGIN * 5
  return { id: ranked[0]?.id, ranked, confident }
}
