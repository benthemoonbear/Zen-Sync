import { createRoot } from 'react-dom/client'
import { App } from '../../src/renderer/App'
import { DEFAULT_PARTS } from '../../src/main/core/parts'
import data from './public/data.json'

const result = { ...data, parts: DEFAULT_PARTS }
;(window as any).api = {
  chooseFolder: async () => '/home/ben/Pictures/bakewell wedding',
  sort: async () => result,
  onProgress: () => () => {},
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
