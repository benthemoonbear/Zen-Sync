import { compareFiles } from './cameras'
import { cosine } from './embed'
import type { Camera, Part, PhotoFile, SortedPhoto } from './types'

export interface MergeInput {
  cameras: Camera[]
  /** photo path → index into parts */
  partOf: Map<string, number>
  /** camera id → ms to add to its capture times (only confirmed fixes) */
  offsets: Map<string, number>
  embs: Map<string, Float32Array>
  partOrder: string[]
  parts: Part[]
}

interface Item {
  photo: PhotoFile
  camera: Camera
  /** position within its camera's sequence for this part */
  seq: number
  timed: boolean
  key: number
  correctedMs?: number
}

/**
 * Interleaves all cameras into one wedding-day order. Within each part, photos from fully
 * timed cameras are ordered by corrected capture time. Photos from cameras without (complete)
 * times keep their own shooting order and are slotted next to the most similar timed photo;
 * when a part has no timed photos at all, cameras are interleaved by relative position.
 */
export function mergeCameras(input: MergeInput): SortedPhoto[] {
  const { cameras, partOf, offsets, embs, partOrder, parts } = input
  const byPart = new Map<number, Item[]>()

  for (const camera of cameras) {
    const counters = new Map<number, number>()
    for (const photo of camera.photos) {
      const part = partOf.get(photo.path)
      if (part === undefined) continue
      const seq = counters.get(part) ?? 0
      counters.set(part, seq + 1)
      const correctedMs = camera.timed ? photo.captureMs! + (offsets.get(camera.id) ?? 0) : undefined
      const item: Item = { photo, camera, seq, timed: camera.timed, key: correctedMs ?? 0, correctedMs }
      byPart.set(part, [...(byPart.get(part) ?? []), item])
    }
  }

  const out: SortedPhoto[] = []
  for (const partId of partOrder) {
    const pIndex = parts.findIndex((p) => p.id === partId)
    const items = byPart.get(pIndex)
    if (!items?.length) continue
    for (const it of orderPart(items, embs)) {
      out.push({
        path: it.photo.path,
        name: it.photo.name,
        cameraId: it.camera.id,
        partId,
        correctedMs: it.correctedMs,
        unsure: false
      })
    }
  }
  return out
}

function orderPart(items: Item[], embs: Map<string, Float32Array>): Item[] {
  const timed = items.filter((i) => i.timed)
  const untimed = items.filter((i) => !i.timed)

  if (!timed.length) {
    const counts = new Map<string, number>()
    for (const i of items) counts.set(i.camera.id, (counts.get(i.camera.id) ?? 0) + 1)
    for (const i of items) i.key = (i.seq + 0.5) / counts.get(i.camera.id)!
    return [...items].sort(
      (a, b) =>
        a.key - b.key ||
        counts.get(b.camera.id)! - counts.get(a.camera.id)! ||
        a.camera.id.localeCompare(b.camera.id) ||
        compareFiles(a.photo, b.photo)
    )
  }

  const byCamera = new Map<string, Item[]>()
  for (const i of untimed) byCamera.set(i.camera.id, [...(byCamera.get(i.camera.id) ?? []), i])
  for (const seqItems of byCamera.values()) {
    seqItems.sort((a, b) => a.seq - b.seq)
    let floor = -Infinity
    for (const i of seqItems) {
      const e = embs.get(i.photo.path)
      let best = timed[0]
      let bestSim = -Infinity
      if (e) {
        for (const t of timed) {
          const te = embs.get(t.photo.path)
          if (!te) continue
          const s = cosine(e, te)
          if (s > bestSim) {
            bestSim = s
            best = t
          }
        }
      }
      i.key = Math.max(floor, best.key)
      floor = i.key
    }
  }

  return [...items].sort(
    (a, b) =>
      a.key - b.key ||
      Number(a.timed ? 0 : 1) - Number(b.timed ? 0 : 1) ||
      (a.camera.id === b.camera.id ? a.seq - b.seq : 0) ||
      compareFiles(a.photo, b.photo)
  )
}
