import { existsSync, statSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

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
  onReady(folder: string, photoCount: number): void
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
    const [folder, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
    if (!folder) return
    if ((await o.newestChangeMs(folder)) > now() - o.settleMs) {
      timer = setTimeout(() => void check(), o.quietMs)
      return
    }
    files = []
    folders = []
    o.onReady(folder, count ?? 0)
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
