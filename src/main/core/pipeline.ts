import { groupCameras } from './cameras'
import { argmax, isUnsure, partTextEmbeddings, scoreParts } from './classify'
import { findClockOffsets } from './clock'
import type { Embedder } from './embed'
import { mergeCameras } from './merge'
import { scanFolder } from './scan'
import { assignMonotonic } from './smooth'
import type { Part, PhotoFile, Skipped, SortResult } from './types'
import { applyCorrections, type CorrectionSet } from './corrections'

export type Stage = 'scan' | 'analyse' | 'arrange'

export interface SortDeps {
  embedder: Embedder
  parts: Part[]
  corrections?: CorrectionSet
  onProgress?: (stage: Stage, done: number, total: number) => void
}

/** Everything the app keeps from a sort so it can re-merge (clock fixes) and learn (corrections). */
export interface SortSession {
  dir: string
  result: SortResult
  embs: Map<string, Float32Array>
  partOf: Map<string, number>
  scores: Map<string, number[]>
  offsets: Map<string, number>
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
  onProgress?.('scan', 1, 1)

  const { embs, failed } = await embedAll(scanned.photos, embedder, (d, t) => onProgress?.('analyse', d, t))
  if (scanned.photos.length && !embs.size) throw new Error('MODEL_FAILED')
  const photos = scanned.photos.filter((p) => embs.has(p.path))
  const skipped = [...scanned.skipped, ...failed]

  onProgress?.('arrange', 0, 1)
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
    offsets: new Map(),
    result: { photos: [], parts, cameras, clock: findClockOffsets(cameras, embs), skipped }
  }
  remerge(session)
  onProgress?.('arrange', 1, 1)
  return session
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
