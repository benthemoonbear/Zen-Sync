import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, Notification, protocol, shell, Tray } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, rm, symlink } from 'node:fs/promises'
import { homedir, hostname } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createSiglipEmbedder } from './core/embed'
import { createHandlers, type Handlers } from './ipc'
import { makeThumb, parseThumbUrl } from './thumbs'
import { INVOKE_METHODS } from '../shared/api'
import { PAYMENTS } from './payments-config'
import {
  createExportCollector, darktableConfigDir, exportActionsDir, installDarktable, newestJpegChange, pathsFromArgv, watchFolder
} from './core/lightroom'
import { EVENTS } from '../shared/api'

protocol.registerSchemesAsPrivileged([
  { scheme: 'thumb', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let handlersRef: Handlers | null = null
/** Folders of saved jobs kept in sync (late photos are added in the background) */
let syncedDirs: string[] = []
const inSyncedJob = (path: string) => syncedDirs.find((d) => path === d || path.startsWith(d + sep)) ?? null

// One Zen Sync at a time: Lightroom launches the app once per batch of exported photos,
// so later launches hand their photos to the window that's already open.
if (!app.requestSingleInstanceLock()) app.quit()

/** A finished export waiting for the window to be ready, and whether the window is listening yet. */
let launchFolder: { dir: string; photos: string[] } | null = null
let rendererListening = false
const exportCollector = createExportCollector({
  quietMs: 2000,
  settleMs: 1500,
  newestChangeMs: newestJpegChange,
  onReady: (dir, photos) => {
    // An export into a job that's already kept in sync (e.g. late edits re-exported) updates that job.
    const job = inSyncedJob(dir)
    if (job && handlersRef) {
      void handlersRef.syncJob(job).catch((e) => console.error('Sync failed:', e))
      return
    }
    if (win && rendererListening) {
      win.webContents.send(EVENTS.openFolder, { dir, photos })
      if (win.isMinimized()) win.restore()
      win.focus()
    } else launchFolder = { dir, photos }
  }
})
const receive = (argv: string[]) => {
  const paths = pathsFromArgv(argv)
  if (paths.length) exportCollector.add(paths)
}
receive(process.argv)
app.on('second-instance', (_e, argv) => {
  receive(argv)
  if (win && !pathsFromArgv(argv).length) {
    win.show()
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})
// macOS hands files to an already-running app this way.
app.on('open-file', (e, path) => {
  e.preventDefault()
  exportCollector.add([path])
})

/** Where this copy of Zen Sync is: the AppImage, the .app bundle, or the .exe. */
function appLocation(): string {
  if (process.env.APPIMAGE) return process.env.APPIMAGE
  if (process.platform === 'darwin') return resolve(process.execPath, '../../..')
  return process.execPath
}

/** darktable: offered where darktable has been run (its settings folder exists) and Zen Sync can be launched from it. */
function darktableDeps() {
  if (process.env.FLATPAK_ID) return undefined // a sandboxed Zen Sync can't be launched from darktable directly
  const config = darktableConfigDir(process.platform, process.env, homedir())
  if (!existsSync(config)) return undefined
  return {
    install: async () => {
      const script = app.isPackaged
        ? join(process.resourcesPath, 'darktable', 'zen_sync.lua')
        : join(app.getAppPath(), 'integrations', 'darktable', 'zen_sync.lua')
      await installDarktable(config, appLocation(), await readFile(script, 'utf8'))
    }
  }
}

/** The folder being watched for exports from any editor, if one is set. */
let stopWatching: (() => void) | null = null
function startWatching(dir: string | null) {
  stopWatching?.()
  stopWatching = null
  if (!dir || !existsSync(dir)) return
  try {
    // Photos landing in a synced job inside the watched folder are that job's business, not a new export.
    stopWatching = watchFolder(dir, (paths) => {
      const fresh = paths.filter((p) => !inSyncedJob(p))
      if (fresh.length) exportCollector.add(fresh, [])
    })
  } catch (e) {
    console.error('Could not watch folder:', e)
  }
}

/** Watches each synced job's folder; once new photos have finished arriving, the job is synced. */
const jobWatchers = new Map<string, { stop: () => void; add: (paths: string[]) => void }>()
function watchJobs(dirs: string[]) {
  syncedDirs = dirs.map((d) => resolve(d))
  for (const [dir, w] of jobWatchers) {
    if (!syncedDirs.includes(dir)) {
      w.stop()
      jobWatchers.delete(dir)
    }
  }
  for (const dir of syncedDirs) {
    if (jobWatchers.has(dir) || !existsSync(dir)) continue
    const collector = createExportCollector({
      quietMs: 3000,
      settleMs: 2000,
      newestChangeMs: newestJpegChange,
      onReady: () => void handlersRef?.syncJob(dir).catch((e) => console.error('Sync failed:', e))
    })
    try {
      // Deletions matter too, so any change to a JPEG (not just new ones) triggers a check.
      const stop = watchFolder(dir, (paths) => collector.add(paths, []), { includeRemoved: true })
      jobWatchers.set(dir, { stop, add: collector.add })
    } catch (e) {
      console.error('Could not watch job folder:', e)
    }
  }
  updateTray()
}

/** Tells the person (system notification) when a job was updated in the background. */
function notifySynced(e: { name: string; added: number; removed: number; blocked?: string }) {
  if (!Notification.isSupported()) return
  const plural = (n: number) => (n === 1 ? 'photo' : 'photos')
  const body = e.blocked
    ? `New photos arrived in “${e.name}”, but the free version saves up to 250. Unlock Zen Sync to keep it in sync.`
    : [e.added && `${e.added} new ${plural(e.added)} added`, e.removed && `${e.removed} ${plural(e.removed)} removed`].filter(Boolean).join(', ') +
      ` in “${e.name}”. The numbered copies are up to date.`
  new Notification({ title: 'Zen Sync', body, silent: true }).show()
}

function trayIcon() {
  const file = app.isPackaged ? join(process.resourcesPath, 'tray-icon.png') : join(app.getAppPath(), 'build', 'icon.png')
  return nativeImage.createFromPath(file).resize({ width: 22, height: 22 })
}

/** The tray icon keeps Zen Sync running (and syncing) after the window is closed. */
function updateTray() {
  if (!app.isReady()) return
  if (!tray) {
    try {
      tray = new Tray(trayIcon())
    } catch (e) {
      console.error('No tray available:', e)
      return
    }
    tray.setToolTip('Zen Sync')
    tray.on('click', () => showWindow())
  }
  const n = syncedDirs.length
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Zen Sync', click: () => showWindow() },
      { label: n ? `Keeping ${n} ${n === 1 ? 'job' : 'jobs'} in sync` : 'No jobs kept in sync', enabled: false },
      { type: 'separator' },
      { label: 'Quit Zen Sync', click: () => { quitting = true; app.quit() } }
    ])
  )
}

function showWindow() {
  if (!win) createWindow()
  else {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
}

/** Puts Zen Sync in Lightroom Classic's After Export menu: a shortcut (Windows) or an alias to the app (Mac). */
function lightroomDeps() {
  const actionsDir = exportActionsDir(process.platform, process.env, homedir())
  if (!actionsDir) return undefined
  if (process.platform === 'win32') {
    return {
      actionsDir,
      fileName: 'Zen Sync.lnk',
      install: async (file: string) => {
        const ok = shell.writeShortcutLink(file, 'replace', { target: process.execPath, description: 'Put the exported photos in wedding-day order with Zen Sync' })
        if (!ok) throw new Error('Windows refused to create the shortcut')
      }
    }
  }
  return {
    actionsDir,
    fileName: 'Zen Sync.app',
    install: async (file: string) => {
      await rm(file, { force: true })
      await symlink(resolve(process.execPath, '../../..'), file)
    }
  }
}

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
  // Closing the window keeps Zen Sync in the tray so synced jobs stay up to date; Quit is in the tray menu.
  let toldAboutTray = false
  win.on('close', (e) => {
    if (quitting || !tray) return
    e.preventDefault()
    win?.hide()
    if (!toldAboutTray && Notification.isSupported()) {
      toldAboutTray = true
      new Notification({ title: 'Zen Sync is still running', body: 'It keeps your synced jobs up to date from the tray. Quit from the tray icon.', silent: true }).show()
    }
  })
  win.on('closed', () => (win = null))
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
    emit: (channel, payload) => {
      if (channel === EVENTS.jobSynced) notifySynced(payload as { name: string; added: number; removed: number; blocked?: string })
      win?.webContents.send(channel, payload)
    },
    jobsChanged: watchJobs,
    lightroom: lightroomDeps(),
    darktable: darktableDeps(),
    appLocation: appLocation(),
    watchFolderChanged: startWatching,
    takeLaunchFolder: () => {
      rendererListening = true
      const f = launchFolder
      launchFolder = null
      return f
    }
  })
  register(handlers)
  handlersRef = handlers
  void handlers.getWatchFolder().then(startWatching)
  // Keep saved jobs in sync, catching up on anything added while Zen Sync was closed.
  void handlers.syncedJobs().then(async (jobs) => {
    watchJobs(jobs.map((j) => j.dir))
    for (const j of jobs) await handlers.syncJob(j.dir).catch((e) => console.error('Sync failed:', e))
  })
  createWindow()
  updateTray()
})

app.on('before-quit', () => (quitting = true))

app.on('window-all-closed', () => {
  if (!tray) app.quit()
})
