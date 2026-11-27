import { existsSync, statSync, watch } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

const JPEG = /\.jpe?g$/i

/**
 * Photos and folders passed on the command line, e.g. by Lightroom Classic's
 * "After Export: Open in Other Application". Anything that isn't an existing JPEG or folder is ignored,
 * as are flags, the app's own path, and "." from a development run.
 */
export function pathsFromArgv(argv: string[]): string[] {
  const out: string[] = []
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-') || arg === '.') continue
    const p = resolve(arg)
    try {
      const s = statSync(p)
      if ((s.isFile() && JPEG.test(p)) || s.isDirectory()) out.push(p)
    } catch {
      // not a path
    }
  }
  return out
}

/** Lightroom Classic's Export Actions folder: whatever is in it appears in the Export dialog's After Export menu. */
export function exportActionsDir(platform: NodeJS.Platform, env: Record<string, string | undefined>, home: string): string | null {
  if (platform === 'win32') return env.APPDATA ? join(env.APPDATA, 'Adobe', 'Lightroom', 'Export Actions') : null
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'Adobe', 'Lightroom', 'Export Actions')
  return null
}

/** Newest modification time of the JPEGs in a folder (0 if none), to tell when an export has finished writing. */
export async function newestJpegChange(folder: string): Promise<number> {
  let newest = 0
  try {
    for (const name of await readdir(folder)) {
      if (!JPEG.test(name)) continue
      const { mtimeMs } = await stat(join(folder, name))
      if (mtimeMs > newest) newest = mtimeMs
    }
  } catch {
    // folder gone
  }
  return newest
}

export interface CollectorOptions {
  /** How long no new batch must arrive before the export counts as finished */
  quietMs: number
  /** How long the folder's files must have been unchanged */
  settleMs: number
  newestChangeMs(folder: string): Promise<number>
  /** The export folder and the photos sent from it (empty when a whole folder was sent) */
  onReady(folder: string, photos: string[]): void
  now?(): number
}

/**
 * Lightroom runs the After Export application once per batch of a few photos while the export is still going.
 * This gathers the batches and, once Lightroom has gone quiet and the folder has stopped changing,
 * reports the export folder once.
 */
export function createExportCollector(o: CollectorOptions) {
  const now = o.now ?? Date.now
  let files: string[] = []
  let folders: string[] = []
  let timer: ReturnType<typeof setTimeout> | undefined

  async function check() {
    timer = undefined
    const counts = new Map<string, number>()
    for (const f of files) counts.set(dirname(f), (counts.get(dirname(f)) ?? 0) + 1)
    for (const d of folders) if (!counts.has(d)) counts.set(d, 0)
    const [folder] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
    if (!folder) return
    if ((await o.newestChangeMs(folder)) > now() - o.settleMs) {
      timer = setTimeout(() => void check(), o.quietMs)
      return
    }
    const sent = folders.includes(folder) ? [] : [...new Set(files.filter((f) => dirname(f) === folder))]
    files = []
    folders = []
    o.onReady(folder, sent)
  }

  return {
    /** Paths from one launch; folders (whole folders sent directly) can be listed in `dirs`. */
    add(paths: string[], dirs: string[] = paths.filter((p) => !JPEG.test(p) && existsSync(p) && statSync(p).isDirectory())) {
      for (const p of paths) {
        if (dirs.includes(p)) folders.push(p)
        else files.push(p)
      }
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void check(), o.quietMs)
    }
  }
}

const OWN_OUTPUT = /^numbered(\.(tmp|old)-[0-9a-f]+)?$/i

/** A new file in a watched folder that should count as an export: a JPEG, not hidden, not Zen Sync's own output. */
export function isWatchedPhoto(root: string, path: string): boolean {
  const rel = relative(root, path)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return false
  const parts = rel.split(/[\\/]/)
  if (parts.some((p) => p.startsWith('.') || OWN_OUTPUT.test(p))) return false
  return JPEG.test(path)
}

/**
 * Watches a folder (and its sub-folders) for exported JPEGs from any editor and reports their paths.
 * Pair it with createExportCollector to wait for each export to finish. Returns a function that stops watching.
 */
export function watchFolder(root: string, onPhotos: (paths: string[]) => void, opts: { includeRemoved?: boolean } = {}): () => void {
  const watcher = watch(root, { recursive: true }, (_event, name) => {
    if (!name) return
    const path = join(root, name.toString())
    if (isWatchedPhoto(root, path) && (opts.includeRemoved || existsSync(path))) onPhotos([path])
  })
  watcher.on('error', () => {})
  return () => watcher.close()
}

/** darktable's settings folder (where luarc and the lua/ scripts folder live). */
export function darktableConfigDir(platform: NodeJS.Platform, env: Record<string, string | undefined>, home: string): string {
  if (platform === 'win32') return join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'darktable')
  return join(home, '.config', 'darktable')
}

/**
 * Installs the Zen Sync export destination into darktable: writes lua/zen_sync.lua pointing at this copy of
 * Zen Sync and makes darktable load it at start-up (once).
 */
export async function installDarktable(configDir: string, appPath: string, script: string): Promise<void> {
  const luaString = appPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  await mkdir(join(configDir, 'lua'), { recursive: true })
  await writeFile(join(configDir, 'lua', 'zen_sync.lua'), script.replace('__ZEN_SYNC_APP__', () => luaString))
  const luarc = join(configDir, 'luarc')
  const current = existsSync(luarc) ? await readFile(luarc, 'utf8') : ''
  if (!/^\s*require\s*\(?\s*["']zen_sync["']/m.test(current)) {
    await writeFile(luarc, `${current}${current && !current.endsWith('\n') ? '\n' : ''}require "zen_sync"\n`)
  }
}
