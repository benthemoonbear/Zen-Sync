export interface PhotoFile {
  path: string
  name: string
  /** Sub-folder of the dropped folder it was found in ('' at the top), "/" separated */
  folder?: string
  size: number
  captureMs?: number
  make?: string
  model?: string
  serial?: string
}

export interface Camera {
  id: string
  label: string
  photos: PhotoFile[]
  timed: boolean
}

export interface Part {
  id: string
  name: string
  prompts: string[]
  floating?: boolean
  /** Optional bigger folder this part is saved inside, e.g. "Reception" */
  group?: string
}

export interface ClockSuggestion {
  cameraId: string
  offsetMs: number
  pairs: number
}

export interface SortedPhoto {
  path: string
  name: string
  cameraId: string
  partId: string
  correctedMs?: number
  unsure: boolean
}

/** A video clip found with the photos, placed into the day by its start time */
export interface SortedClip {
  path: string
  name: string
  folder?: string
  size?: number
  /** Start time of day, stored as if UTC (like photo capture times) */
  startMs?: number
  durationMs?: number
  fps?: number
  startTimecode?: string
  model?: string
  /** Part it was placed in, and whether its time was missing */
  partId?: string
  unsure?: boolean
}

export interface Skipped {
  name: string
  reason: string
}

export interface SortResult {
  photos: SortedPhoto[]
  parts: Part[]
  cameras: Camera[]
  clock: ClockSuggestion[]
  skipped: Skipped[]
  /** The type of event the parts came from, and whether Zen Sync detected it */
  event?: { id: string; name: string; detected: boolean }
  /** Moments found that aren't on the parts list, offered as new parts */
  moments?: { name: string; paths: string[]; afterPartId: string | null }[]
  /** Video clips found in the folder, in day order */
  clips?: SortedClip[]
}

export type SaveMode = 'single' | 'perPart'
