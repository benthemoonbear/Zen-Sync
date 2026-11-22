import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createSiglipEmbedder } from './core/embed'
import { createHandlers, type Handlers } from './ipc'
import { makeThumb, parseThumbUrl } from './thumbs'
import { INVOKE_METHODS } from '../shared/api'

protocol.registerSchemesAsPrivileged([
  { scheme: 'thumb', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#1c1c1e',
    title: 'Zen Sync',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

function register(handlers: Handlers): void {
  for (const m of INVOKE_METHODS) {
    ipcMain.handle(`api:${m}`, (_e, ...args: unknown[]) => (handlers[m] as (...a: unknown[]) => unknown)(...args))
  }
  protocol.handle('thumb', async (req) => {
    const { path, width } = parseThumbUrl(req.url)
    if (!handlers.isAllowedPath(path)) return new Response('Not allowed', { status: 403 })
    try {
      const file = await makeThumb(path, width, join(app.getPath('userData'), 'thumbs'))
      return net.fetch(pathToFileURL(file).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

app.whenReady().then(() => {
  const userData = app.getPath('userData')
  const handlers = createHandlers({
    userData,
    createEmbedder: (onDownload) => createSiglipEmbedder(join(userData, 'models'), onDownload),
    chooseFolder: async () => {
      const r = await dialog.showOpenDialog(win!, { title: 'Choose a folder of finished JPEGs', properties: ['openDirectory'] })
      return r.canceled ? null : r.filePaths[0]
    },
    openExternal: (url) => shell.openExternal(url),
    showItemInFolder: (path) => shell.showItemInFolder(path),
    fetch: (input, init) => net.fetch(input as string, init),
    instanceName: hostname(),
    productId: Number(import.meta.env.MAIN_VITE_LS_PRODUCT_ID ?? 0),
    buyUrl: String(import.meta.env.MAIN_VITE_LS_CHECKOUT_URL ?? 'https://zenvisuals.co.uk'),
    emit: (channel, payload) => win?.webContents.send(channel, payload)
  })
  register(handlers)
  createWindow()
})

app.on('window-all-closed', () => app.quit())
