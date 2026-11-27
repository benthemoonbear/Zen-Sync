import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, link, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { extname, join } from 'node:path'
import { canSave } from './licence'
import type { Part, SaveMode, SortedClip, SortedPhoto } from './types'
import { placeClips } from './video'

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
  /** A video clip: doesn't count towards the free photo limit */
  clip?: boolean
  /** The part a clip was placed in */
  partId?: string
}

function folderName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'Untitled'
}

const num = (n: number) => String(n).padStart(2, '0')

/**
 * Numbered names: 1.jpg… through the day. Per-part mode makes "01 Name" folders for non-empty parts;
 * a part with a group goes inside "NN Group/MM Name", numbered within its group. Folders are numbered
 * in the order they first appear. Video clips are placed among the photos by time and numbered V001…
 */
export function planOutput(photos: SortedPhoto[], parts: Part[], mode: SaveMode, clips: SortedClip[] = []): PlannedCopy[] {
  const placed = placeClips(photos, clips)
  type Item = { src: string; partId: string; clip?: string }
  const seq: Item[] = []
  let k = 0
  const fallbackPart = parts[0]?.id ?? ''
  const pushClips = (after: number) => {
    while (k < placed.length && placed[k].after === after) {
      const c = placed[k++]
      seq.push({ src: c.path, partId: c.partId || fallbackPart, clip: extname(c.name).toLowerCase() || '.mp4' })
    }
  }
  // Clips are in day order but their "after" index can step back when photos were moved by hand.
  placed.sort((a, b) => a.after - b.after)
  pushClips(-1)
  photos.forEach((p, i) => {
    seq.push({ src: p.path, partId: p.partId })
    pushClips(i)
  })
  while (k < placed.length) pushClips(placed[k].after)

  const top = new Map<string, { folder: string; children: number }>()
  const folders = new Map<string, string>()
  const folderFor = (partId: string) => {
    let folder = folders.get(partId)
    if (!folder) {
      const part = parts.find((x) => x.id === partId)
      const name = folderName(part?.name ?? partId)
      const group = part?.group ? folderName(part.group) : ''
      if (group && group !== 'Untitled') {
        let g = top.get(`g:${group}`)
        if (!g) {
          g = { folder: `${num(top.size + 1)} ${group}`, children: 0 }
          top.set(`g:${group}`, g)
        }
        folder = `${g.folder}/${num(++g.children)} ${name}`
      } else {
        folder = `${num(top.size + 1)} ${name}`
        top.set(`p:${partId}`, { folder, children: 0 })
      }
      folders.set(partId, folder)
    }
    return folder
  }
  let photoN = 0
  let clipN = 0
  return seq.map((item) => {
    const file = item.clip ? `V${String(++clipN).padStart(3, '0')}${item.clip}` : `${++photoN}.jpg`
    const rel = mode === 'single' ? file : `${folderFor(item.partId)}/${file}`
    return item.clip ? { src: item.src, rel, clip: true, partId: item.partId } : { src: item.src, rel }
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
  opts: { overwrite: boolean; mode: SaveMode; licensed: boolean; folder?: string; extra?: { rel: string; content: string }[] }
): Promise<{ written: number } | { exists: true }> {
  const check = canSave(plan.filter((c) => !c.clip).length, opts.mode, opts.licensed)
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
      // Clips can be many gigabytes: a hard link on the same drive is instant and takes no space.
      if (c.clip) await link(c.src, dest).catch(() => copyFile(c.src, dest, constants.COPYFILE_EXCL))
      else await copyFile(c.src, dest, constants.COPYFILE_EXCL)
    }
    for (const x of opts.extra ?? []) {
      const dest = join(tmp, ...x.rel.split('/'))
      await mkdir(join(dest, '..'), { recursive: true })
      await writeFile(dest, x.content, 'utf8')
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
