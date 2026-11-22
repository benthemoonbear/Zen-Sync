import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { canSave } from './licence'
import type { Part, SaveMode, SortedPhoto } from './types'

export const OUTPUT_FOLDER = 'numbered'

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

  const tmp = join(inputDir, `${folder}.tmp-${randomBytes(4).toString('hex')}`)
  try {
    for (const c of plan) {
      const dest = join(tmp, ...c.rel.split('/'))
      await mkdir(join(dest, '..'), { recursive: true })
      await copyFile(c.src, dest, constants.COPYFILE_EXCL)
    }
    if (await exists(out)) await rm(out, { recursive: true, force: true })
    await rename(tmp, out)
  } catch (e) {
    await rm(tmp, { recursive: true, force: true })
    throw e
  }
  return { written: plan.length }
}
