import type { Part, SaveMode, SortedPhoto, SortResult } from '../main/core/types'

export type { Part, SaveMode, SortedPhoto, SortResult }

export interface Progress {
  stage: 'scan' | 'analyse' | 'arrange'
  done: number
  total: number
}

export interface SaveRequest {
  dir: string
  photos: SortedPhoto[]
  parts: Part[]
  mode: SaveMode
  overwrite: boolean
}

export type SaveResponse = { written: number; outDir: string } | { exists: true } | { blocked: 'limit' | 'perPartLocked' }

export interface Api {
  chooseFolder(): Promise<string | null>
  sort(dir: string): Promise<SortResult>
  onProgress(cb: (p: Progress) => void): () => void
  onModelDownload(cb: (pct: number) => void): () => void
  applyClockFix(cameraId: string): Promise<SortResult>
  recordCorrection(path: string, partId: string): Promise<void>
  save(req: SaveRequest): Promise<SaveResponse>
  getParts(): Promise<Part[]>
  setParts(parts: Part[]): Promise<void>
  getShortcuts(): Promise<Record<string, string>>
  setShortcuts(map: Record<string, string>): Promise<void>
  getEvents(): Promise<{ current: string; events: { id: string; name: string }[] }>
  setEvent(id: string): Promise<void>
  licence(): Promise<{ licensed: boolean; customerName?: string; key?: string }>
  activate(key: string): Promise<{ ok: true; customerName: string } | { ok: false; message: string }>
  deactivate(): Promise<{ ok: boolean; message?: string }>
  buy(): Promise<{ ok: true; customerName: string } | { ok: false; cancelled: true } | { ok: false; message: string }>
  showFolder(path: string): Promise<void>
  pathForFile(file: File): string
}

/** Invoke-style methods, in the order the preload exposes them. */
export const INVOKE_METHODS = [
  'chooseFolder', 'sort', 'applyClockFix', 'recordCorrection', 'save', 'getParts', 'setParts',
  'getEvents', 'setEvent', 'getShortcuts', 'setShortcuts', 'licence', 'activate', 'deactivate', 'buy', 'showFolder'
] as const

export type InvokeMethod = (typeof INVOKE_METHODS)[number]

export const EVENTS = { progress: 'progress', modelDownload: 'model-download' } as const

export const THUMB_SMALL = 320
export const THUMB_LARGE = 1600

export function thumbUrl(path: string, width: number): string {
  return `thumb://img/${encodeURIComponent(path)}?w=${width}`
}
