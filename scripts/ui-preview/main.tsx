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
      if (!location.search.includes('slow')) return resolve(result)
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
  getEvents: async () => ({ current: currentEvent, events: EVENT_TYPES.map(({ id, name }) => ({ id, name })) }),
  setEvent: async (id: string) => { currentEvent = id },
  getShortcuts: async () => ({}),
  setShortcuts: async () => {},
  lightroomStatus: async () => ({ supported: true, installed: false }),
  addToLightroom: async () => ({ ok: true }),
  takeLaunchFolder: async () => null,
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
