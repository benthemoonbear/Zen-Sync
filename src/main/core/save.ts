import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { join } from 'node:path'
import { canSave } from './licence'
import type { Part, SaveMode, SortedPhoto } from './types'

export const OUTPUT_FOLDER = 'numbered'

/** File operations that can be swapped in tests (Windows locking behaviour). */
export const fsOps = { rename }

const RENAME_TRIES = 6

/** Windows often holds a just-written folder briefly (antivirus, indexer, Explorer): retry. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fsOps.rename(from, to)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (attempt >= RENAME_TRIES || !['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '')) throw e
      await sleep(150 * attempt)
    }
  }
}

export interface PlannedCopy {
  src: string
  /** path relative to the output folder, always with "/" separators */
  rel: string
}

function folderName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'Untitled'
}

/** Numbered names: 1.jpg… through the day; per-part folders "01 Name" for non-empty parts only. */
export function planOutput(photos: SortedPhoto[], parts: Part[], mode: SaveMode): PlannedCopy[] {
  if (mode === 'single') return photos.map((p, i) => ({ src: p.path, rel: `${i + 1}.jpg` }))
  const folders = new Map<string, string>()
  return photos.map((p, i) => {
    let folder = folders.get(p.partId)
    if (!folder) {
      const name = parts.find((x) => x.id === p.partId)?.name ?? p.partId
      folder = `${String(folders.size + 1).padStart(2, '0')} ${folderName(name)}`
      folders.set(p.partId, folder)
    }
    return { src: p.path, rel: `${folder}/${i + 1}.jpg` }
  })
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

/**
 * Writes byte-identical copies into <inputDir>/numbered. Never touches anything else in the
 * input folder: copies go to a temp folder first, and only numbered/ itself is replaced.
 */
export async function writeCopies(
  inputDir: string,
  plan: PlannedCopy[],
  opts: { overwrite: boolean; mode: SaveMode; licensed: boolean; folder?: string }
): Promise<{ written: number } | { exists: true }> {
  const check = canSave(plan.length, opts.mode, opts.licensed)
  if (!check.ok) {
    throw new Error(check.reason === 'limit' ? 'The free version saves up to 250 photos' : 'Folder per part is locked in the free version')
  }
  const folder = opts.folder ?? OUTPUT_FOLDER
  if (/[\\/]|^\.\.?$/.test(folder)) throw new Error('Invalid output folder name')
  const out = join(inputDir, folder)
  if ((await exists(out)) && !opts.overwrite) return { exists: true }

  const id = randomBytes(4).toString('hex')
  const tmp = join(inputDir, `${folder}.tmp-${id}`)
  const backup = join(inputDir, `${folder}.old-${id}`)
  try {
    for (const c of plan) {
      const dest = join(tmp, ...c.rel.split('/'))
      await mkdir(join(dest, '..'), { recursive: true })
      await copyFile(c.src, dest, constants.COPYFILE_EXCL)
    }
  } catch (e) {
    await rm(tmp, { recursive: true, force: true })
    throw e
  }

  // Keep the old folder until the new one is safely in place.
  const hadOld = await exists(out)
  if (hadOld) {
    try {
      await renameWithRetry(out, backup)
    } catch (e) {
      await rm(tmp, { recursive: true, force: true })
      throw e
    }
  }
  try {
    await renameWithRetry(tmp, out)
  } catch (e) {
    if (hadOld) await renameWithRetry(backup, out).catch(() => undefined)
    await rm(tmp, { recursive: true, force: true })
    throw e
  }
  if (hadOld) await rm(backup, { recursive: true, force: true }).catch(() => undefined)
  return { written: plan.length }
}
