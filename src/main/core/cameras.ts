import type { Camera, PhotoFile } from './types'

/** All digit runs in a file name, as numbers: "DSC03272-3.jpg" → [3272, 3]. */
export function fileNumber(name: string): number[] {
  return (name.replace(/\.[^.]+$/, '').match(/\d+/g) ?? []).map(Number)
}

export function filePrefix(name: string): string {
  const m = /^[^\d]+/.exec(name.replace(/\.[^.]+$/, ''))
  const prefix = (m?.[0] ?? '').replace(/[_\-\s]+$/, '')
  return prefix || 'other'
}

function compareNumbers(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]
  return a.length - b.length
}

/** File order fallback: file number, then full name. */
export function compareFiles(a: { name: string }, b: { name: string }): number {
  return compareNumbers(fileNumber(a.name), fileNumber(b.name)) || a.name.localeCompare(b.name)
}

function identity(p: PhotoFile): string | undefined {
  if (p.serial) return `serial:${p.serial}`
  if (p.model) return `model:${[p.make, p.model].filter(Boolean).join(' ')}`
  return undefined
}

/**
 * Groups photos into cameras. Photos are first grouped by file-name prefix; within a prefix,
 * photos are split by serial number (or make+model) when they have it. Photos without
 * metadata join their prefix's only identified camera, so one re-exported file with EXIF
 * doesn't split a camera in two.
 */
export function groupCameras(photos: PhotoFile[]): Camera[] {
  const byPrefix = new Map<string, PhotoFile[]>()
  for (const p of photos) {
    const k = filePrefix(p.name)
    byPrefix.set(k, [...(byPrefix.get(k) ?? []), p])
  }

  const cameras: Camera[] = []
  for (const [prefix, group] of byPrefix) {
    const ids = new Map<string, PhotoFile[]>()
    const unknown: PhotoFile[] = []
    for (const p of group) {
      const id = identity(p)
      if (id) ids.set(id, [...(ids.get(id) ?? []), p])
      else unknown.push(p)
    }
    const folders = new Set(unknown.map((p) => p.folder ?? ''))
    if (ids.size === 0 && folders.size > 1) {
      // No camera details at all: different sub-folders are the best clue to different cameras.
      for (const f of [...folders].sort()) {
        const ps = unknown.filter((p) => (p.folder ?? '') === f)
        cameras.push(makeCamera(`prefix:${prefix}|folder:${f}`, f.split('/').pop() || prefix, ps))
      }
    } else if (ids.size <= 1) {
      const only = [...ids.values()][0] ?? []
      const model = only.find((p) => p.model)?.model
      cameras.push(makeCamera(`prefix:${prefix}`, model ?? prefix, [...only, ...unknown]))
    } else {
      for (const [id, ps] of ids) cameras.push(makeCamera(`prefix:${prefix}|${id}`, ps[0].model ?? prefix, ps))
      if (unknown.length) cameras.push(makeCamera(`prefix:${prefix}|unknown`, prefix, unknown))
    }
  }
  return cameras.sort((a, b) => b.photos.length - a.photos.length || a.id.localeCompare(b.id))
}

function makeCamera(id: string, label: string, photos: PhotoFile[]): Camera {
  const timed = photos.length > 0 && photos.every((p) => p.captureMs !== undefined)
  const sorted = [...photos].sort((a, b) =>
    timed ? a.captureMs! - b.captureMs! || compareFiles(a, b) : compareFiles(a, b)
  )
  return { id, label, photos: sorted, timed }
}
