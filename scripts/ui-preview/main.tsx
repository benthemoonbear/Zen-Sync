import { createRoot } from 'react-dom/client'
import { App } from '../../src/renderer/App'
import { DEFAULT_PARTS } from '../../src/main/core/parts'
import { EVENT_TYPES } from '../../src/main/core/events'
import bakewell from './public/data.json'
import robyn from './public/data-robyn.json'
const data: any = location.search.includes('robyn') ? robyn : bakewell

const result = { ...data, parts: DEFAULT_PARTS }
let progressCb: any
let currentEvent = 'wedding'
;(window as any).api = {
  chooseFolder: async () => (location.search.includes('robyn') ? '/home/you/Pictures/Robyn & Gabriel' : location.search.includes('demo') ? '/home/you/Pictures/Smith wedding' : '/home/ben/Pictures/bakewell wedding'),
  sort: () =>
    new Promise((resolve) => {
      const dyn = location.search.includes('moments')
        ? { ...result, event: { id: 'wedding', name: 'Wedding', detected: true }, moments: [{ name: 'Sparkler exit', paths: result.photos.slice(-6).map((p: any) => p.path), afterPartId: result.photos.at(-7).partId }] }
        : location.search.includes('clips')
          ? { ...result, clips: Array.from({ length: 38 }, (_, i) => ({ path: `/w/C${String(i + 1).padStart(4, '0')}.MP4`, name: `C${String(i + 1).padStart(4, '0')}.MP4`, fps: 25, durationMs: 30000 })) }
          : result
      if (!location.search.includes('slow')) return resolve(dyn)
      let done = 0
      const t = setInterval(() => {
        done += Math.max(1, Math.round(data.photos.length / 30))
        progressCb?.({ stage: done < data.photos.length ? "analyse" : "arrange", done: Math.min(done, data.photos.length), total: data.photos.length })
        if (done > data.photos.length + 12) { clearInterval(t); resolve(result) }
      }, 120)
    }),
  onProgress: (cb: any) => ((progressCb = cb), () => {}),
  onModelDownload: () => () => {},
  applyClockFix: async () => ({ ...result, clock: [] }),
  recordCorrection: async () => {},
  save: async () => ({ written: data.photos.length, outDir: '/x/numbered' }),
  getParts: async () => EVENT_TYPES.find((e) => e.id === currentEvent)!.parts,
  getEvents: async () => ({ current: 'auto', events: [...EVENT_TYPES.map(({ id, name }) => ({ id, name })), { id: 'custom-1', name: 'Bar mitzvah', custom: true }] }),
  createEvent: async () => 'custom-2',
  renameEvent: async () => {},
  deleteEvent: async () => {},
  resortAs: async () => ({ ...result, event: { id: 'corporate', name: 'Corporate event', detected: false } }),
  setEvent: async (id: string) => { currentEvent = id },
  getShortcuts: async () => ({}),
  setShortcuts: async () => {},
  lightroomStatus: async () => ({ supported: true, installed: false }),
  addToLightroom: async () => ({ ok: true }),
  takeLaunchFolder: async () => null,
  getWatchFolder: async () => null,
  syncJob: async () => ({ added: 0, removed: 0 }),
  syncedJobs: async () => [
    { dir: '/w/Robyn & Gabriel', name: 'Robyn & Gabriel', photos: 412, savedAt: Date.now() - 3600_000 },
    { dir: '/w/Smith wedding', name: 'Smith wedding', photos: 538, savedAt: Date.now() - 86400_000 * 2 }
  ],
  stopSyncing: async () => {},
  onJobSynced: (cb: (e: unknown) => void) => {
    if (location.search.includes('toast')) setTimeout(() => cb({ dir: '/w/Robyn & Gabriel', name: 'Robyn & Gabriel', added: 3, removed: 0 }), 1500)
    return () => {}
  },
  chooseWatchFolder: async () => 'D:\\Exports\\Weddings',
  clearWatchFolder: async () => {},
  appLocation: async () => 'C:\\Users\\Ben\\AppData\\Local\\Programs\\Zen Sync\\Zen Sync.exe',
  darktableSupported: async () => true,
  addToDarktable: async () => ({ ok: true }),
  onOpenFolder: () => () => {},
  setParts: async () => {},
  licence: async () => ({ licensed: false }),
  activate: async () => ({ ok: true, customerName: 'Jane Smith' }),
  deactivate: async () => ({ ok: true }),
  openBuyPage: async () => {},
  showFolder: async () => {},
  pathForFile: () => ''
}
createRoot(document.getElementById('root')!).render(<App />)
