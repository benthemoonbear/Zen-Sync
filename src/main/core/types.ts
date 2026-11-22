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
}

export type SaveMode = 'single' | 'perPart'
