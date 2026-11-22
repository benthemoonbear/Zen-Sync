import { createRoot } from 'react-dom/client'
import { App } from '../../src/renderer/App'
import { DEFAULT_PARTS } from '../../src/main/core/parts'
import data from './public/data.json'

const result = { ...data, parts: DEFAULT_PARTS }
let progressCb: any
;(window as any).api = {
  chooseFolder: async () => '/home/ben/Pictures/bakewell wedding',
  sort: () =>
    new Promise((resolve) => {
      if (!location.search.includes('slow')) return resolve(result)
      let done = 0
      const t = setInterval(() => {
        done += 4
        progressCb?.({ stage: done < 124 ? 'analyse' : 'arrange', done: Math.min(done, 124), total: 124 })
        if (done > 140) { clearInterval(t); resolve(result) }
      }, 120)
    }),
  onProgress: (cb: any) => ((progressCb = cb), () => {}),
  onModelDownload: () => () => {},
  applyClockFix: async () => ({ ...result, clock: [] }),
  recordCorrection: async () => {},
  save: async () => ({ written: 124, outDir: '/x/numbered' }),
  getParts: async () => DEFAULT_PARTS,
  setParts: async () => {},
  licence: async () => ({ licensed: false }),
  activate: async () => ({ ok: true, customerName: 'Jane Smith' }),
  deactivate: async () => ({ ok: true }),
  openBuyPage: async () => {},
  showFolder: async () => {},
  pathForFile: () => ''
}
createRoot(document.getElementById('root')!).render(<App />)
