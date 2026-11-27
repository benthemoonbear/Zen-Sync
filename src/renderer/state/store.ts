import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { Part, SortedPhoto, SortResult } from '../../main/core/types'
import { insertPartBetween, moveSection, movePhotos, movePhotosToPart, nextUnsure, orderByParts } from './order'

export interface AppState {
  dir: string | null
  result: SortResult | null
  photos: SortedPhoto[]
  partOrder: string[]
  parts: Part[]
  selected: string[]
  current: string | null
  /** Where a Shift-click or Shift+arrow range starts */
  anchor: string | null
  /** A folder (e.g. from Lightroom) the start screen should sort next */
  incoming: string | null
  openFolder(dir: string): void
  takeIncoming(): string | null
  edited: boolean
  load(dir: string, result: SortResult): void
  replaceResult(result: SortResult): void
  select(path: string, extend: boolean): void
  selectRange(path: string): void
  selectAll(): void
  selectPaths(paths: string[], add: boolean): void
  clearSelection(): void
  step(delta: number, extend?: boolean): void
  movePhotos(paths: string[], toIndex: number): void
  sendToPart(partId: string): void
  moveSection(partId: string, toIndex: number): void
  newPartWithSelection(afterPartId: string | null, name: string): string
  goNextUnsure(): void
  reset(): void
}

export interface StoreDeps {
  recordCorrection(path: string, partId: string): Promise<void>
}

export function createAppStore(deps: StoreDeps) {
  return createStore<AppState>()((set, get) => {
    const record = (photos: SortedPhoto[], paths: string[]) => {
      for (const p of photos) if (paths.includes(p.path)) void deps.recordCorrection(p.path, p.partId)
    }
    const empty = { dir: null, result: null, photos: [], partOrder: [], parts: [], selected: [], current: null, anchor: null, edited: false, incoming: null }
    return {
      ...empty,
      load: (dir, result) => {
        const partOrder = result.parts.map((p) => p.id)
        const photos = orderByParts(result.photos, partOrder)
        set({
          dir,
          result,
          photos,
          parts: result.parts,
          partOrder,
          selected: photos[0] ? [photos[0].path] : [],
          current: photos[0]?.path ?? null,
          anchor: photos[0]?.path ?? null,
          edited: false
        })
      },
      replaceResult: (result) => {
        const { partOrder } = get()
        set({ result, photos: orderByParts(result.photos, partOrder), edited: false })
      },
      select: (path, extend) => {
        const { selected } = get()
        if (!extend) return set({ selected: [path], current: path, anchor: path })
        const next = selected.includes(path) ? selected.filter((p) => p !== path) : [...selected, path]
        set({ selected: next.length ? next : [path], current: path, anchor: path })
      },
      selectRange: (path) => {
        const { photos, anchor, current } = get()
        const a = photos.findIndex((p) => p.path === (anchor ?? current))
        const b = photos.findIndex((p) => p.path === path)
        if (b < 0) return
        if (a < 0) return set({ selected: [path], current: path, anchor: path })
        const [lo, hi] = a <= b ? [a, b] : [b, a]
        set({ selected: photos.slice(lo, hi + 1).map((p) => p.path), current: path })
      },
      selectAll: () => set({ selected: get().photos.map((p) => p.path) }),
      selectPaths: (paths, add) => {
        if (!paths.length && add) return
        const base = add ? get().selected : []
        const next = [...base, ...paths.filter((p) => !base.includes(p))]
        set({ selected: next.length ? next : get().current ? [get().current!] : [], current: paths.at(-1) ?? get().current })
      },
      clearSelection: () => {
        const { current } = get()
        set({ selected: current ? [current] : [], anchor: current })
      },
      step: (delta, extend = false) => {
        const { photos, current } = get()
        if (!photos.length) return
        const i = Math.max(0, Math.min(photos.length - 1, photos.findIndex((p) => p.path === current) + delta))
        if (extend) return get().selectRange(photos[i].path)
        set({ current: photos[i].path, selected: [photos[i].path], anchor: photos[i].path })
      },
      movePhotos: (paths, toIndex) => {
        const before = new Map(get().photos.map((p) => [p.path, p.partId]))
        const photos = movePhotos(get().photos, paths, toIndex)
        record(photos, paths.filter((p) => before.get(p) !== photos.find((x) => x.path === p)?.partId))
        set({ photos, edited: true })
      },
      sendToPart: (partId) => {
        const { selected, photos, partOrder } = get()
        if (!selected.length) return
        const next = movePhotosToPart(photos, selected, partId, partOrder)
        record(next, selected)
        set({ photos: next, edited: true })
      },
      moveSection: (partId, toIndex) => {
        const partOrder = moveSection(get().partOrder, partId, toIndex)
        set({ partOrder, photos: orderByParts(get().photos, partOrder), edited: true })
      },
      newPartWithSelection: (afterPartId, name) => {
        const r = insertPartBetween(get().partOrder, get().parts, afterPartId, name)
        const { selected } = get()
        set({ partOrder: r.partOrder, parts: r.parts, photos: movePhotosToPart(get().photos, selected, r.newId, r.partOrder), edited: true })
        return r.newId
      },
      goNextUnsure: () => {
        const path = nextUnsure(get().photos, get().current)
        if (path) set({ current: path, selected: [path], anchor: path })
      },
      openFolder: (dir) => set({ ...empty, incoming: dir }),
      takeIncoming: () => {
        const dir = get().incoming
        if (dir) set({ incoming: null })
        return dir
      },
      reset: () => set(empty)
    }
  })
}

export type AppStore = ReturnType<typeof createAppStore>

let singleton: AppStore | undefined
export function appStore(): AppStore {
  singleton ??= createAppStore({ recordCorrection: (p, id) => window.api.recordCorrection(p, id) })
  return singleton
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(appStore(), selector)
}
