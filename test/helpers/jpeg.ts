import sharp from 'sharp'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function tempDir(name = 'wps'): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), 'wps-'))
  const dir = join(base, name)
  await mkdir(dir, { recursive: true })
  return dir
}

export interface JpegOpts {
  colour?: { r: number; g: number; b: number }
  exif?: Record<string, string>
}

export async function jpegBuffer(opts: JpegOpts = {}): Promise<Buffer> {
  let img = sharp({
    create: { width: 32, height: 24, channels: 3, background: opts.colour ?? { r: 200, g: 180, b: 160 } }
  }).jpeg()
  if (opts.exif) img = img.withExif({ IFD2: opts.exif } as never)
  return img.toBuffer()
}

export async function writeJpeg(dir: string, name: string, opts: JpegOpts = {}): Promise<string> {
  const p = join(dir, name)
  await writeFile(p, await jpegBuffer(opts))
  return p
}
