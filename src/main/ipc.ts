import { join, resolve } from 'node:path'
import { addCorrection, type CorrectionSet } from './core/corrections'
import type { Embedder } from './core/embed'
import { activate, canSave, claimPurchase, deactivate, isLicensed, type LicenceState } from './core/licence'
import { DEFAULT_EVENT, EVENT_TYPES, eventById, partsForSort } from './core/events'
import { MODEL } from './core/embed'
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
  /** Licence server (Cloudflare Worker) base URL */
  serverUrl: string
  /** Stripe Payment Link URL */
  checkoutUrl: string
  /** Opens the checkout in an app window; resolves with the Checkout Session id once Stripe redirects to successPrefix, or null if closed. */
  openCheckout(url: string, successPrefix: string): Promise<string | null>
  emit(channel: string, payload: unknown): void
}

export function createHandlers(deps: HandlerDeps) {
  const shortcutsStore = createStore<Record<string, string>>(join(deps.userData, 'shortcuts.json'), {})
  const eventStore = createStore<string>(join(deps.userData, 'event.json'), DEFAULT_EVENT)
  const currentEvent = () => eventById(eventStore.get())
  // Wedding parts keep the original parts.json, so edits from older versions carry over.
  const partsStore = (id: string) =>
    createStore<Part[] | null>(join(deps.userData, id === 'wedding' ? 'parts.json' : `parts-${id}.json`), null)
  const loadParts = (): Part[] => {
    const ev = currentEvent()
    const saved = partsStore(ev.id).get()
    return Array.isArray(saved) && saved.length ? saved : ev.parts
  }
  const licenceStore = createStore<LicenceState | null>(join(deps.userData, 'licence.json'), null)
  // Corrections hold embeddings, which only mean something to the model that made them.
  const correctionsStore = createStore<CorrectionSet>(join(deps.userData, `corrections-${MODEL.id}.json`), [])
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
      let model: Embedder
      try {
        model = await getEmbedder()
      } catch (e) {
        console.error('Model load failed:', e)
        throw new Error('MODEL_DOWNLOAD_FAILED')
      }
      session = await runSort(dir, {
        embedder: model,
        parts: partsForSort(loadParts()),
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
      return loadParts()
    },

    /** Saves the current event's parts; an empty list resets them to the event's defaults. */
    async setParts(parts: Part[]): Promise<void> {
      partsStore(currentEvent().id).set(parts.length ? parts : null)
    },

    async getShortcuts(): Promise<Record<string, string>> {
      return shortcutsStore.get()
    },

    async setShortcuts(map: Record<string, string>): Promise<void> {
      const clean: Record<string, string> = {}
      for (const [k, v] of Object.entries(map ?? {})) if (typeof v === 'string' && v.length <= 40) clean[k] = v
      shortcutsStore.set(clean)
    },

    async getEvents(): Promise<{ current: string; events: { id: string; name: string }[] }> {
      return { current: currentEvent().id, events: EVENT_TYPES.map(({ id, name }) => ({ id, name })) }
    },

    async setEvent(id: string): Promise<void> {
      if (EVENT_TYPES.some((e) => e.id === id)) eventStore.set(id)
    },

    async licence(): Promise<{ licensed: boolean; customerName?: string; key?: string }> {
      const s = licenceStore.get()
      return isLicensed(s) ? { licensed: true, customerName: s!.customerName, key: s!.key } : { licensed: false }
    },

    /** In-app purchase: Stripe checkout in an app window, then the licence arrives automatically. */
    async buy(): Promise<{ ok: true; customerName: string } | { ok: false; cancelled: true } | { ok: false; message: string }> {
      if (!deps.checkoutUrl || !deps.serverUrl) {
        return { ok: false, message: "This copy of the app isn't set up for purchases yet. Contact support." }
      }
      const sessionId = await deps.openCheckout(deps.checkoutUrl, `${deps.serverUrl.replace(/\/$/, '')}/success`)
      if (!sessionId) return { ok: false, cancelled: true }
      const r = await claimPurchase(sessionId, deps)
      if (!r.ok) return r
      licenceStore.set(r.state)
      return { ok: true, customerName: r.state.customerName }
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


    async showFolder(path: string): Promise<void> {
      deps.showItemInFolder(path)
    },

    isAllowedPath: (path: string) => allowed.has(resolve(path))
  }
}

export type Handlers = ReturnType<typeof createHandlers>
