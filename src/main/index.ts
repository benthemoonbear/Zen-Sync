import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createSiglipEmbedder } from './core/embed'
import { createHandlers, type Handlers } from './ipc'
import { makeThumb, parseThumbUrl } from './thumbs'
import { INVOKE_METHODS } from '../shared/api'
import { PAYMENTS } from './payments-config'

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

/**
 * Stripe checkout in its own window. Resolves with the Checkout Session id when Stripe redirects to the
 * licence server's success page (…/success?session_id=cs_…), or null if the customer closes the window.
 * The window uses a throwaway session and no preload, so the checkout page can't reach the app.
 */
function openCheckout(url: string, successPrefix: string): Promise<string | null> {
  return new Promise((resolve) => {
    const checkout = new BrowserWindow({
      parent: win ?? undefined,
      modal: true,
      width: 520,
      height: 760,
      title: 'Zen Sync — checkout',
      backgroundColor: '#ffffff',
      autoHideMenuBar: true,
      webPreferences: { partition: 'checkout', sandbox: true, contextIsolation: true }
    })
    let done = false
    const finish = (id: string | null) => {
      if (done) return
      done = true
      resolve(id)
      if (id) setTimeout(() => !checkout.isDestroyed() && checkout.close(), 3500)
    }
    const watch = (_e: unknown, target: string) => {
      if (!target.startsWith(successPrefix)) return
      const id = new URL(target).searchParams.get('session_id')
      if (id) finish(id)
    }
    checkout.webContents.on('will-redirect', watch)
    checkout.webContents.on('will-navigate', watch)
    checkout.webContents.on('did-navigate', watch)
    checkout.webContents.setWindowOpenHandler(({ url: link }) => {
      if (/^https:\/\//.test(link)) void shell.openExternal(link)
      return { action: 'deny' }
    })
    checkout.on('closed', () => finish(null))
    void checkout.loadURL(url)
  })
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
    serverUrl: String(import.meta.env.MAIN_VITE_LICENCE_SERVER_URL || PAYMENTS.licenceServerUrl),
    checkoutUrl: String(import.meta.env.MAIN_VITE_CHECKOUT_URL || PAYMENTS.checkoutUrl),
    openCheckout,
    emit: (channel, payload) => win?.webContents.send(channel, payload)
  })
  register(handlers)
  createWindow()
})

app.on('window-all-closed', () => app.quit())
