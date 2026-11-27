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
  /** Keep this job in sync: photos added to the folder later are placed and the numbered copies updated */
  keepInSync?: boolean
  /** Video clips found with the photos: copy them into the numbered folders, and/or write timecode lists (both by default) */
  video?: VideoOptions
}

export interface VideoOptions {
  copy: boolean
  timecode: boolean
}

export type SaveResponse = { written: number; outDir: string; clips?: number } | { exists: true } | { blocked: 'limit' | 'perPartLocked' }

export interface Api {
  chooseFolder(): Promise<string | null>
  sort(dir: string, only?: string[]): Promise<SortResult>
  onProgress(cb: (p: Progress) => void): () => void
  onModelDownload(cb: (pct: number) => void): () => void
  applyClockFix(cameraId: string): Promise<SortResult>
  recordCorrection(path: string, partId: string): Promise<void>
  save(req: SaveRequest): Promise<SaveResponse>
  getParts(eventId?: string): Promise<Part[]>
  setParts(parts: Part[], eventId?: string): Promise<void>
  getShortcuts(): Promise<Record<string, string>>
  setShortcuts(map: Record<string, string>): Promise<void>
  /** current is 'auto' (detect from the photos) or an event type id */
  getEvents(): Promise<{ current: string; events: { id: string; name: string; custom?: boolean }[] }>
  setEvent(id: string): Promise<void>
  createEvent(name: string): Promise<string>
  renameEvent(id: string, name: string): Promise<void>
  deleteEvent(id: string): Promise<void>
  /** Re-sort the open job as another event type (no re-reading photos) */
  resortAs(eventId: string): Promise<SortResult>
  licence(): Promise<{ licensed: boolean; customerName?: string; key?: string }>
  activate(key: string): Promise<{ ok: true; customerName: string } | { ok: false; message: string }>
  deactivate(): Promise<{ ok: boolean; message?: string }>
  buy(): Promise<{ ok: true; customerName: string } | { ok: false; cancelled: true } | { ok: false; message: string }>
  showFolder(path: string): Promise<void>
  lightroomStatus(): Promise<{ supported: boolean; installed: boolean }>
  addToLightroom(): Promise<{ ok: true } | { ok: false; message: string }>
  syncJob(dir: string): Promise<{ added: number; removed: number; blocked?: 'limit' | 'perPartLocked' }>
  syncedJobs(): Promise<{ dir: string; name: string; photos: number; savedAt: number }[]>
  stopSyncing(dir: string): Promise<void>
  /** A synced job was updated in the background */
  onJobSynced(cb: (e: { dir: string; name: string; added: number; removed: number; blocked?: 'limit' | 'perPartLocked' }) => void): () => void
  getWatchFolder(): Promise<string | null>
  chooseWatchFolder(): Promise<string | null>
  clearWatchFolder(): Promise<void>
  appLocation(): Promise<string>
  darktableSupported(): Promise<boolean>
  addToDarktable(): Promise<{ ok: true } | { ok: false; message: string }>
  takeLaunchFolder(): Promise<{ dir: string; photos: string[] } | null>
  /** A folder of photos sent from Lightroom while the app is open */
  onOpenFolder(cb: (sent: { dir: string; photos: string[] }) => void): () => void
  pathForFile(file: File): string
}

/** Invoke-style methods, in the order the preload exposes them. */
export const INVOKE_METHODS = [
  'chooseFolder', 'sort', 'applyClockFix', 'recordCorrection', 'save', 'getParts', 'setParts',
  'getEvents', 'setEvent', 'createEvent', 'renameEvent', 'deleteEvent', 'resortAs', 'getShortcuts', 'setShortcuts', 'licence', 'activate', 'deactivate', 'buy', 'showFolder',
  'lightroomStatus', 'addToLightroom', 'takeLaunchFolder',
  'syncJob', 'syncedJobs', 'stopSyncing',
  'getWatchFolder', 'chooseWatchFolder', 'clearWatchFolder', 'appLocation', 'darktableSupported', 'addToDarktable'
] as const

export type InvokeMethod = (typeof INVOKE_METHODS)[number]

export const EVENTS = { progress: 'progress', modelDownload: 'model-download', openFolder: 'open-folder', jobSynced: 'job-synced' } as const

export const THUMB_SMALL = 320
export const THUMB_LARGE = 1600

export function thumbUrl(path: string, width: number): string {
  return `thumb://img/${encodeURIComponent(path)}?w=${width}`
}
