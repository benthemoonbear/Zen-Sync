import { vi } from 'vitest'
import type { Api, Progress } from '../../src/shared/api'
import type { SortResult } from '../../src/main/core/types'

export function sampleResult(): SortResult {
  const parts = ['getting-ready', 'details', 'arrival', 'ceremony', 'signing', 'confetti'].map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1).replace('-', ' '), prompts: [] }))
  const photos = [
    ...Array.from({ length: 9 }, (_, i) => ({ partId: 'arrival', i })),
    ...Array.from({ length: 25 }, (_, i) => ({ partId: 'ceremony', i: i + 9 })),
    ...Array.from({ length: 90 }, (_, i) => ({ partId: 'confetti', i: i + 34 }))
  ].map(({ partId, i }) => ({
    path: `/w/bakewell wedding/IMG${i}.jpg`, name: `IMG${i}.jpg`, cameraId: i % 3 ? 'prefix:BHV' : 'prefix:DSC',
    partId, unsure: i === 12 || i === 40, correctedMs: Date.UTC(2026, 10, 7, 11, 47) + i * 20_000
  }))
  return {
    parts,
    photos,
    cameras: [
      { id: 'prefix:BHV', label: 'ILCE-7RM2', photos: [], timed: true },
      { id: 'prefix:DSC', label: 'ILME-FX3', photos: [], timed: false }
    ],
    clock: [{ cameraId: 'prefix:BHV', offsetMs: (8 * 60 + 35) * 60_000, pairs: 3 }],
    skipped: []
  }
}

export function mockApi(overrides: Partial<Api> = {}) {
  const listeners: { progress?: (p: Progress) => void; download?: (n: number) => void } = {}
  const api: Api = {
    chooseFolder: vi.fn(async () => '/w/bakewell wedding'),
    sort: vi.fn(async () => sampleResult()),
    onProgress: (cb) => ((listeners.progress = cb), () => {}),
    onModelDownload: (cb) => ((listeners.download = cb), () => {}),
    applyClockFix: vi.fn(async () => ({ ...sampleResult(), clock: [] })),
    recordCorrection: vi.fn(async () => {}),
    save: vi.fn(async () => ({ written: 124, outDir: '/w/bakewell wedding/numbered' })),
    getParts: vi.fn(async () => sampleResult().parts),
    setParts: vi.fn(async () => {}),
    getEvents: vi.fn(async () => ({
      current: 'wedding',
      events: [{ id: 'wedding', name: 'Wedding' }, { id: 'corporate', name: 'Corporate event' }]
    })),
    setEvent: vi.fn(async () => {}),
    getShortcuts: vi.fn(async () => ({})),
    setShortcuts: vi.fn(async () => {}),
    licence: vi.fn(async () => ({ licensed: false })),
    activate: vi.fn(async () => ({ ok: true as const, customerName: 'Jane Smith' })),
    deactivate: vi.fn(async () => ({ ok: true })),
    buy: vi.fn(async () => ({ ok: true as const, customerName: 'Jane Smith' })),
    showFolder: vi.fn(async () => {}),
    pathForFile: vi.fn(() => '/w/dropped wedding'),
    ...overrides
  }
  window.api = api
  return { api, listeners }
}
