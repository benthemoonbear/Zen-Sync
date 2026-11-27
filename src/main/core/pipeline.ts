import { groupCameras } from './cameras'
import { argmax, isUnsure, partTextEmbeddings, scoreParts } from './classify'
import { findClockOffsets } from './clock'
import type { Embedder } from './embed'
import { mergeCameras } from './merge'
import { scanFolder } from './scan'
import { assignMonotonic } from './smooth'
import type { Part, PhotoFile, Skipped, SortedClip, SortResult } from './types'
import { placeClips } from './video'
import { applyCorrections, type CorrectionSet } from './corrections'
import { findMoments, MOMENT_MIN_PHOTOS } from './moments'

export type Stage = 'scan' | 'analyse' | 'arrange'

export interface SortDeps {
  embedder: Embedder
  parts: Part[]
  corrections?: CorrectionSet
  onProgress?: (stage: Stage, done: number, total: number) => void
  /** Sort only these photos in the folder (e.g. the ones an editor just exported) */
  only?: string[]
  /** Choose the parts after the photos have been seen (automatic event type); overrides `parts` */
  choose?: (images: Float32Array[]) => Promise<{ parts: Part[]; event: NonNullable<SortResult['event']> }>
  /** The event type the parts belong to (when not chosen automatically) */
  event?: SortResult['event']
  /** Names of moments to look for that aren't on the parts list */
  vocab?: string[]
  /** Fewest photos that make a moment (default MOMENT_MIN_PHOTOS) */
  minMomentPhotos?: number
}

type ClassifyDeps = Pick<SortDeps, 'embedder' | 'parts' | 'corrections' | 'event' | 'vocab' | 'minMomentPhotos'>

/** Everything the app keeps from a sort so it can re-merge (clock fixes) and learn (corrections). */
export interface SortSession {
  dir: string
  result: SortResult
  embs: Map<string, Float32Array>
  partOf: Map<string, number>
  scores: Map<string, number[]>
  offsets: Map<string, number>
  /** The photos that were read, and files that couldn't be, kept so the sort can be redone with other parts */
  files: PhotoFile[]
  skipped: Skipped[]
  /** Video clips found with the photos */
  clips: SortedClip[]
}

const CHUNK = 16

async function embedAll(
  photos: PhotoFile[],
  embedder: Embedder,
  onProgress?: (done: number, total: number) => void
): Promise<{ embs: Map<string, Float32Array>; failed: Skipped[] }> {
  const embs = new Map<string, Float32Array>()
  const failed: Skipped[] = []
  for (let i = 0; i < photos.length; i += CHUNK) {
    const chunk = photos.slice(i, i + CHUNK)
    try {
      const vs = await embedder.embedImages(chunk.map((p) => p.path))
      chunk.forEach((p, k) => embs.set(p.path, vs[k]))
    } catch {
      for (const p of chunk) {
        try {
          const [v] = await embedder.embedImages([p.path])
          embs.set(p.path, v)
        } catch {
          failed.push({ name: p.name, reason: "Couldn't read this photo's image data" })
        }
      }
    }
    onProgress?.(Math.min(photos.length, i + CHUNK), photos.length)
  }
  return { embs, failed }
}

export async function runSort(dir: string, deps: SortDeps): Promise<SortSession> {
  const { embedder, parts, onProgress } = deps
  onProgress?.('scan', 0, 1)
  const scanned = await scanFolder(dir)
  if (deps.only) {
    const keep = new Set(deps.only)
    scanned.photos = scanned.photos.filter((p) => keep.has(p.path))
    scanned.skipped = []
    scanned.videos = []
  }
  onProgress?.('scan', 1, 1)

  const { embs, failed } = await embedAll(scanned.photos, embedder, (d, t) => onProgress?.('analyse', d, t))
  if (scanned.photos.length && !embs.size) throw new Error('MODEL_FAILED')
  const photos = scanned.photos.filter((p) => embs.has(p.path))
  const skipped = [...scanned.skipped, ...failed]

  onProgress?.('arrange', 0, 1)
  let classifyDeps: ClassifyDeps = deps
  if (deps.choose) {
    const chosen = await deps.choose(photos.map((p) => embs.get(p.path)!))
    classifyDeps = { ...deps, parts: chosen.parts, event: chosen.event }
  }
  const session = await classify(dir, photos, embs, skipped, classifyDeps, new Map(), scanned.videos)
  onProgress?.('arrange', 1, 1)
  return session
}

/** Text embeddings of the moment names, cached per embedder. */
const vocabCache = new WeakMap<Embedder, Map<string, Float32Array>>()
async function vocabEmbeddings(names: string[], embedder: Embedder) {
  const cache = vocabCache.get(embedder) ?? new Map<string, Float32Array>()
  vocabCache.set(embedder, cache)
  const missing = names.filter((n) => !cache.has(n))
  if (missing.length) {
    const vs = await embedder.embedTexts(missing.map((n) => `a photo of ${n}`))
    missing.forEach((n, i) => cache.set(n, vs[i]))
  }
  return names.map((name) => ({ name, emb: cache.get(name)! }))
}

/** Assigns parts, orders the day and looks for moments, from photos already embedded. */
async function classify(
  dir: string,
  photos: PhotoFile[],
  embs: Map<string, Float32Array>,
  skipped: Skipped[],
  deps: ClassifyDeps,
  offsets: Map<string, number> = new Map(),
  clips: SortedClip[] = []
): Promise<SortSession> {
  const { embedder, parts } = deps
  const cameras = groupCameras(photos)
  const partEmbs = await partTextEmbeddings(parts, embedder)
  const images = photos.map((p) => embs.get(p.path)!)
  let rows = scoreParts(images, partEmbs)
  if (deps.corrections?.length) rows = applyCorrections(rows, images, deps.corrections, parts)
  const scores = new Map(photos.map((p, i) => [p.path, rows[i]]))

  const floating = parts.map((p) => !!p.floating)
  const partOf = new Map<string, number>()
  for (const cam of cameras) {
    const assigned = assignMonotonic(cam.photos.map((p) => scores.get(p.path)!), floating)
    cam.photos.forEach((p, i) => partOf.set(p.path, assigned[i]))
  }

  const session: SortSession = {
    dir,
    embs,
    partOf,
    scores,
    offsets,
    files: photos,
    skipped,
    clips,
    // Clocks already fixed stay fixed, so they aren't suggested again.
    result: { photos: [], parts, cameras, clock: findClockOffsets(cameras, embs).filter((c) => !offsets.has(c.cameraId)), skipped, event: deps.event }
  }
  remerge(session)

  if (deps.vocab?.length && session.result.photos.length) {
    const vocab = await vocabEmbeddings(deps.vocab, embedder)
    const moments = findMoments(
      session.result.photos.map((p) => ({ path: p.path, ms: p.correctedMs, emb: embs.get(p.path)!, partId: p.partId })),
      parts.map((p, i) => ({ id: p.id, name: p.name, emb: partEmbs[i] })),
      vocab,
      deps.minMomentPhotos ?? MOMENT_MIN_PHOTOS
    )
    session.result.moments = moments
  } else session.result.moments = []
  return session
}

/** Re-sorts with different parts (e.g. another event type) using the photos already read: no re-embedding. */
export async function reclassify(session: SortSession, deps: ClassifyDeps): Promise<SortSession> {
  return classify(session.dir, session.files, session.embs, session.skipped, deps, session.offsets, session.clips)
}

function remerge(s: SortSession): void {
  const { cameras, parts } = s.result
  s.result.photos = mergeCameras({
    cameras,
    partOf: s.partOf,
    offsets: s.offsets,
    embs: s.embs,
    partOrder: parts.map((p) => p.id),
    parts
  }).map((p) => {
    const row = s.scores.get(p.path)!
    const overridden = argmax(row) !== s.partOf.get(p.path)
    return { ...p, unsure: isUnsure(row) || overridden }
  })
  s.result.clips = placeClips(s.result.photos, s.clips ?? []).map(({ after: _after, ...c }) => c)
}

/** Accepts the suggested clock correction for one camera and re-merges. */
export function applyClockFix(session: SortSession, cameraId: string): SortSession {
  const suggestion = session.result.clock.find((c) => c.cameraId === cameraId)
  if (!suggestion) return session
  const next: SortSession = {
    ...session,
    offsets: new Map(session.offsets).set(cameraId, suggestion.offsetMs),
    result: { ...session.result, clock: session.result.clock.filter((c) => c.cameraId !== cameraId) }
  }
  remerge(next)
  return next
}
