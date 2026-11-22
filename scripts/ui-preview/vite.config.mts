import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only harness: renders the real renderer in a browser with a mock window.api.
const root = resolve(__dirname)
export default defineConfig({
  root,
  publicDir: resolve(root, 'public'),
  plugins: [
    react(),
    {
      name: 'thumb-alias',
      enforce: 'pre',
      resolveId(id, importer) {
        if (id.endsWith('shared/api') && importer && !importer.includes('ui-preview')) return resolve(root, 'api-shim.ts')
        return null
      }
    }
  ]
})
