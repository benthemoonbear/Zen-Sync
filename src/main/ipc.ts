import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { addCorrection, type CorrectionSet } from './core/corrections'
import type { Embedder } from './core/embed'
import { activate, canSave, claimPurchase, deactivate, isLicensed, type LicenceState } from './core/licence'
import { DEFAULT_EVENT, EVENT_TYPES, eventById, partsForSort } from './core/events'
import { MODEL } from './core/embed'
import { applyClockFix, runSort, type SortSession } from './core/pipeline'
import { OUTPUT_FOLDER, planOutput, writeCopies } from './core/save'
import { createStore } from './core/store'
import { scanFolder } from './core/scan'
import { applyOffsets, placeNewPhotos, type Job } from './core/sync'
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
  /** Lightroom Classic's Export Actions folder and how to put Zen Sync in it (absent where Lightroom Classic doesn't run) */
  lightroom?: { actionsDir: string; fileName: string; install(file: string): Promise<void> }
  /** A folder sent from Lightroom (or the command line) before the window was ready */
  takeLaunchFolder?(): { dir: string; photos: string[] } | null
  /** Called when the watched folder is chosen or cleared, so the app can (re)start watching */
  watchFolderChanged?(dir: string | null): void
  /** Where Zen Sync is installed (the .exe, .app or AppImage), for editors' "browse to application" boxes */
  appLocation?: string
  /** darktable integration: installs Zen Sync as an export destination (absent where darktable isn't set up) */
  darktable?: { install(): Promise<void> }
  /** Called when the list of synced jobs changes, so the app can watch their folders */
  jobsChanged?(dirs: string[]): void
}

export type SyncOutcome = { added: number; removed: number; blocked?: 'limit' | 'perPartLocked' }

export function createHandlers(deps: HandlerDeps) {
  const jobsStore = createStore<Record<string, Job>>(join(deps.userData, 'synced-jobs.json'), {})
  const queues = new Map<string, Promise<unknown>>()
  /** One sync or save at a time per job folder. */
  function serial<T>(dir: string, fn: () => Promise<T>): Promise<T> {
    const next = (queues.get(dir) ?? Promise.resolve()).then(fn, fn)
    queues.set(dir, next.catch(() => {}))
    return next
  }
  const jobsChanged = () => deps.jobsChanged?.(Object.keys(jobsStore.get()))

  /** Adds photos that appeared in a synced job's folder (and drops deleted ones), then rewrites the numbered copies. */
  async function syncJob(dirIn: string): Promise<SyncOutcome> {
    const dir = resolve(dirIn)
    return serial(dir, async () => {
      const job = jobsStore.get()[dir]
      if (!job) return { added: 0, removed: 0 }
      const { photos: onDisk } = await scanFolder(dir)
      const disk = new Set(onDisk.map((p) => p.path))
      const known = new Set(job.photos.map((p) => p.path))
      const fresh = onDisk.filter((p) => !known.has(p.path)).map((p) => p.path)
      const kept = job.photos.filter((p) => disk.has(p.path))
      const removed = job.photos.length - kept.length
      if (!fresh.length && !removed) return { added: 0, removed: 0 }
      let photos = kept
      if (fresh.length) {
        const s = await runSort(dir, {
          embedder: await getEmbedder(),
          parts: partsForSort(job.parts),
          corrections: correctionsStore.get(),
          only: fresh
        })
        // The day's part order as arranged in this job, then any parts not yet used.
        const order = [...new Set([...kept.map((p) => p.partId), ...job.parts.map((p) => p.id)])]
        photos = placeNewPhotos(kept, applyOffsets(s.result.photos, job.offsets), order)
      }
      const licensed = isLicensed(licenceStore.get())
      const check = canSave(photos.length, job.mode, licensed)
      const name = dir.split(/[\\/]/).pop()
      if (!check.ok) {
        deps.emit(EVENTS.jobSynced, { dir, name, added: 0, removed: 0, blocked: check.reason })
        return { added: 0, removed: 0, blocked: check.reason }
      }
      await writeCopies(dir, planOutput(photos, job.parts, job.mode), { overwrite: true, mode: job.mode, licensed })
      jobsStore.set({ ...jobsStore.get(), [dir]: { ...job, photos, savedAt: Date.now() } })
      const outcome = { added: photos.length - kept.length, removed }
      deps.emit(EVENTS.jobSynced, { dir, name, ...outcome })
      return outcome
    })
  }

  const watchStore = createStore<string | null>(join(deps.userData, 'watch-folder.json'), null)
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

    /** Sorts a folder, or only the listed photos in it (those an editor sent). */
    async sort(dir: string, only?: string[]): Promise<SortResult> {
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
        only: only?.length ? only.map((p) => resolve(p)).filter((p) => p.startsWith(resolve(dir) + sep)) : undefined,
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
      const dir = resolve(req.dir)
      const r = await serial(dir, () =>
        writeCopies(req.dir, planOutput(req.photos, req.parts, req.mode), { overwrite: req.overwrite, mode: req.mode, licensed })
      )
      if ('exists' in r) return r
      const jobs = { ...jobsStore.get() }
      const offsets = session && resolve(session.dir) === dir ? Object.fromEntries(session.offsets) : jobsStore.get()[dir]?.offsets
      if (req.keepInSync) jobs[dir] = { dir, mode: req.mode, parts: req.parts, photos: req.photos, savedAt: Date.now(), offsets }
      else delete jobs[dir]
      jobsStore.set(jobs)
      jobsChanged()
      // Catch anything that arrived while the job was being reviewed.
      if (req.keepInSync) void syncJob(dir).catch((e) => console.error('Sync failed:', e))
      return { written: r.written, outDir: join(req.dir, OUTPUT_FOLDER) }
    },

    async getParts(): Promise<Part[]> {
      return loadParts()
    },

    /** Saves the current event's parts; an empty list resets them to the event's defaults. */
    async setParts(parts: Part[]): Promise<void> {
      partsStore(currentEvent().id).set(parts.length ? parts : null)
    },

    async lightroomStatus(): Promise<{ supported: boolean; installed: boolean }> {
      const lr = deps.lightroom
      if (!lr) return { supported: false, installed: false }
      return { supported: true, installed: existsSync(join(lr.actionsDir, lr.fileName)) }
    },

    /** Adds Zen Sync to Lightroom Classic's After Export menu. */
    async addToLightroom(): Promise<{ ok: true } | { ok: false; message: string }> {
      const lr = deps.lightroom
      if (!lr) return { ok: false, message: "Lightroom Classic isn't available on this computer." }
      try {
        await mkdir(lr.actionsDir, { recursive: true })
        await lr.install(join(lr.actionsDir, lr.fileName))
        return { ok: true }
      } catch (e) {
        return { ok: false, message: `Couldn't add Zen Sync to Lightroom (${(e as Error).message}).` }
      }
    },

    syncJob,

    async syncedJobs(): Promise<{ dir: string; name: string; photos: number; savedAt: number }[]> {
      return Object.values(jobsStore.get())
        .map((j) => ({ dir: j.dir, name: j.dir.split(/[\\/]/).pop() ?? j.dir, photos: j.photos.length, savedAt: j.savedAt }))
        .sort((a, b) => b.savedAt - a.savedAt)
    },

    async stopSyncing(dir: string): Promise<void> {
      const jobs = { ...jobsStore.get() }
      delete jobs[resolve(dir)]
      jobsStore.set(jobs)
      jobsChanged()
    },

    async getWatchFolder(): Promise<string | null> {
      return watchStore.get()
    },

    async chooseWatchFolder(): Promise<string | null> {
      const dir = await deps.chooseFolder()
      if (!dir) return watchStore.get()
      watchStore.set(dir)
      deps.watchFolderChanged?.(dir)
      return dir
    },

    async clearWatchFolder(): Promise<void> {
      watchStore.set(null)
      deps.watchFolderChanged?.(null)
    },

    async appLocation(): Promise<string> {
      return deps.appLocation ?? ''
    },

    async darktableSupported(): Promise<boolean> {
      return !!deps.darktable
    },

    async addToDarktable(): Promise<{ ok: true } | { ok: false; message: string }> {
      if (!deps.darktable) return { ok: false, message: "darktable isn't set up on this computer." }
      try {
        await deps.darktable.install()
        return { ok: true }
      } catch (e) {
        return { ok: false, message: `Couldn't add Zen Sync to darktable (${(e as Error).message}).` }
      }
    },

    async takeLaunchFolder(): Promise<{ dir: string; photos: string[] } | null> {
      return deps.takeLaunchFolder?.() ?? null
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
