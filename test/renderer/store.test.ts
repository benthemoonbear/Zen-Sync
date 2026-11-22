import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createAppStore } from '../../src/renderer/state/store'
import type { SortResult } from '../../src/main/core/types'

const result = (): SortResult => ({
  parts: [
    { id: 'ceremony', name: 'Ceremony', prompts: [] },
    { id: 'signing', name: 'Signing', prompts: [] },
    { id: 'confetti', name: 'Confetti', prompts: [] }
  ],
  cameras: [{ id: 'c', label: 'C', photos: [], timed: true }],
  clock: [],
  skipped: [],
  photos: [
    { path: '/w/1.jpg', name: '1.jpg', cameraId: 'c', partId: 'ceremony', unsure: false },
    { path: '/w/2.jpg', name: '2.jpg', cameraId: 'c', partId: 'ceremony', unsure: true },
    { path: '/w/3.jpg', name: '3.jpg', cameraId: 'c', partId: 'confetti', unsure: false }
  ]
})

describe('app store', () => {
  let recordCorrection: ReturnType<typeof vi.fn<(path: string, partId: string) => Promise<void>>>
  let store: ReturnType<typeof createAppStore>
  beforeEach(() => {
    recordCorrection = vi.fn(async () => {})
    store = createAppStore({ recordCorrection })
    store.getState().load('/w', result())
  })

  test('load sets photos, part order and selects the first photo', () => {
    const s = store.getState()
    expect(s.dir).toBe('/w')
    expect(s.partOrder).toEqual(['ceremony', 'signing', 'confetti'])
    expect(s.current).toBe('/w/1.jpg')
    expect(s.edited).toBe(false)
  })

  test('sendToPart moves the selection, records a correction per photo, and marks edited', () => {
    store.getState().select('/w/1.jpg', false)
    store.getState().sendToPart('signing')
    const s = store.getState()
    expect(s.photos.map((p) => `${p.name}:${p.partId}`)).toEqual(['2.jpg:ceremony', '1.jpg:signing', '3.jpg:confetti'])
    expect(recordCorrection).toHaveBeenCalledWith('/w/1.jpg', 'signing')
    expect(s.edited).toBe(true)
  })

  test('select with extend adds to the selection', () => {
    store.getState().select('/w/1.jpg', false)
    store.getState().select('/w/3.jpg', true)
    expect(store.getState().selected).toEqual(['/w/1.jpg', '/w/3.jpg'])
  })

  test('step moves the current photo with the arrow keys', () => {
    store.getState().step(1)
    expect(store.getState().current).toBe('/w/2.jpg')
    store.getState().step(-5)
    expect(store.getState().current).toBe('/w/1.jpg')
  })

  test('moveSection regroups photos', () => {
    store.getState().moveSection('confetti', 0)
    expect(store.getState().photos.map((p) => p.name)).toEqual(['3.jpg', '1.jpg', '2.jpg'])
  })

  test('drop into a new part between sections', () => {
    store.getState().select('/w/3.jpg', false)
    const id = store.getState().newPartWithSelection('ceremony', 'First look')
    const s = store.getState()
    expect(s.partOrder).toEqual(['ceremony', id, 'signing', 'confetti'])
    expect(s.photos.find((p) => p.name === '3.jpg')!.partId).toBe(id)
    expect(s.parts.find((p) => p.id === id)!.name).toBe('First look')
  })

  test('load groups photos by part so on-screen numbers match the saved order', () => {
    const r = result()
    r.photos = [r.photos[2], r.photos[0], r.photos[1]]
    store.getState().load('/w', r)
    expect(store.getState().photos.map((p) => p.name)).toEqual(['1.jpg', '2.jpg', '3.jpg'])
  })

  test('nextUnsure selects the next unsure photo', () => {
    store.getState().goNextUnsure()
    expect(store.getState().current).toBe('/w/2.jpg')
  })
})
