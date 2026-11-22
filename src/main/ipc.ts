import { join, resolve } from 'node:path'
import { addCorrection, type CorrectionSet } from './core/corrections'
import type { Embedder } from './core/embed'
import { activate, canSave, deactivate, isLicensed, type LicenceState } from './core/licence'
import { DEFAULT_PARTS, loadParts, saveParts } from './core/parts'
import { applyClockFix, runSort, type SortSession } from './core/pipeline'
import { OUTPUT_FOLDER, planOutput, writeCopies } from './core/save'
import { createStore } from './core/store'
import type { Part, SortResult } from './core/types'
import { EVENTS, type SaveRequest, type SaveResponse } from '../shared/api'

export interface HandlerDeps {
  userData: string
  createEmbedder(onDownload: (pct: number) => void): Promise<Embedder>
  chooseFolder(): Promise<string | null>
  openExternal(url: string): Promise<void>
  showItemInFolder(path: string): void
  fetch: typeof fetch
  instanceName: string
  productId: number
  buyUrl: string
  emit(channel: string, payload: unknown): void
}

export function createHandlers(deps: HandlerDeps) {
  const partsStore = createStore<Part[] | null>(join(deps.userData, 'parts.json'), null)
  const licenceStore = createStore<LicenceState | null>(join(deps.userData, 'licence.json'), null)
  const correctionsStore = createStore<CorrectionSet>(join(deps.userData, 'corrections.json'), [])
  let embedder: Promise<Embedder> | undefined
  let session: SortSession | undefined
  let allowed = new Set<string>()

  const getEmbedder = () => {
    embedder ??= deps.createEmbedder((pct) => deps.emit(EVENTS.modelDownload, pct)).catch((e) => {
      embedder = undefined
      throw e
    })
    return embedder
  }

  return {
    chooseFolder: () => deps.chooseFolder(),

    async sort(dir: string): Promise<SortResult> {
      session = await runSort(dir, {
        embedder: await getEmbedder(),
        parts: loadParts(partsStore),
        corrections: correctionsStore.get(),
        onProgress: (stage, done, total) => deps.emit(EVENTS.progress, { stage, done, total })
      })
      allowed = new Set(session.result.photos.map((p) => resolve(p.path)))
      return session.result
    },

    async applyClockFix(cameraId: string): Promise<SortResult> {
      if (!session) throw new Error('Nothing sorted yet')
      session = applyClockFix(session, cameraId)
      return session.result
    },

    async recordCorrection(path: string, partId: string): Promise<void> {
      const emb = session?.embs.get(path)
      if (!emb) return
      correctionsStore.set(addCorrection(correctionsStore.get(), emb, partId))
    },

    corrections: () => correctionsStore.get(),

    async save(req: SaveRequest): Promise<SaveResponse> {
      if (!session || resolve(req.dir) !== resolve(session.dir)) throw new Error('Sort this folder before saving')
      if (req.photos.some((p) => !allowed.has(resolve(p.path)))) throw new Error('Photo list does not match the sorted folder')
      const licensed = isLicensed(licenceStore.get())
      const check = canSave(req.photos.length, req.mode, licensed)
      if (!check.ok) return { blocked: check.reason }
      const r = await writeCopies(req.dir, planOutput(req.photos, req.parts, req.mode), {
        overwrite: req.overwrite,
        mode: req.mode,
        licensed
      })
      return 'exists' in r ? r : { written: r.written, outDir: join(req.dir, OUTPUT_FOLDER) }
    },

    async getParts(): Promise<Part[]> {
      return loadParts(partsStore)
    },

    async setParts(parts: Part[]): Promise<void> {
      saveParts(partsStore, parts.length ? parts : DEFAULT_PARTS)
    },

    async licence(): Promise<{ licensed: boolean; customerName?: string }> {
      const s = licenceStore.get()
      return isLicensed(s) ? { licensed: true, customerName: s!.customerName } : { licensed: false }
    },

    async activate(key: string) {
      const r = await activate(key, deps)
      if (!r.ok) return r
      licenceStore.set(r.state)
      return { ok: true as const, customerName: r.state.customerName }
    },

    async deactivate() {
      const s = licenceStore.get()
      if (!s) return { ok: true }
      const r = await deactivate(s, deps)
      if (r.ok) licenceStore.set(null)
      return r
    },

    openBuyPage: () => deps.openExternal(deps.buyUrl),

    async showFolder(path: string): Promise<void> {
      deps.showItemInFolder(path)
    },

    isAllowedPath: (path: string) => allowed.has(resolve(path))
  }
}

export type Handlers = ReturnType<typeof createHandlers>
