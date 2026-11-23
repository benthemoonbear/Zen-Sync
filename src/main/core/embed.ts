import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

export interface Embedder {
  embedImages(paths: string[], onProgress?: (done: number, total: number) => void): Promise<Float32Array[]>
  embedTexts(texts: string[]): Promise<Float32Array[]>
}

/**
 * Google's SigLIP 2 (base, 224px, Apache 2.0), converted for Transformers.js by the "Convert photo model"
 * GitHub Action and published as a release on the Zen Sync repository.
 */
export const MODEL = {
  id: 'siglip2-base-1',
  base: 'https://github.com/benthemoonbear/Zen-Sync/releases/download/model-siglip2-base-1/',
  /** The photo half runs at full precision; the text half is 8-bit (it's mostly a huge word table). */
  visionDtype: 'fp32' as const,
  textDtype: 'q8' as const
}
/** Folder the original SigLIP was downloaded into by earlier versions. */
const OLD_MODEL_DIR = 'Xenova'
const IMAGE_SIZE = 224
const BATCH = 16
/** SigLIP 2 was trained on text padded to 64 tokens. */
const TEXT_LENGTH = 64

export function normalise(v: Float32Array): Float32Array {
  let sum = 0
  for (const x of v) sum += x * x
  const n = Math.sqrt(sum) || 1
  return v.map((x) => x / n)
}

/** Dot product. Inputs are expected to be normalised, so this is the cosine similarity. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

function rows(data: Float32Array, n: number): Float32Array[] {
  const dim = data.length / n
  return Array.from({ length: n }, (_, i) => normalise(data.slice(i * dim, (i + 1) * dim)))
}

interface ManifestFile {
  name: string
  path: string
  size: number
  sha256: string
}

/**
 * Makes sure the model is in `cacheDir/<MODEL.id>`, downloading it from the Zen Sync release if needed.
 * Every file is checked against the release manifest's SHA-256; nothing counts as installed until all pass.
 * Returns the model folder.
 */
export async function ensureModel(cacheDir: string, onDownload?: (pct: number) => void, fetchImpl: typeof fetch = fetch): Promise<string> {
  const dir = join(cacheDir, MODEL.id)
  const done = join(dir, '.complete')
  if (!existsSync(done)) {
    const res = await fetchImpl(`${MODEL.base}manifest.json`)
    if (!res.ok) throw new Error(`Model download failed (${res.status})`)
    const manifest = (await res.json()) as { files: ManifestFile[] }
    const root = resolve(dir) + sep
    for (const f of manifest.files) {
      if (!/^[\w.-]+$/.test(f.name) || !resolve(dir, f.path).startsWith(root)) throw new Error('Bad model manifest')
    }
    const total = manifest.files.reduce((n, f) => n + f.size, 0) || 1
    let loaded = 0
    let lastPct = -1
    const report = () => {
      const pct = Math.min(99, Math.floor((loaded / total) * 100))
      if (pct > lastPct) onDownload?.((lastPct = pct))
    }
    await mkdir(dir, { recursive: true })
    for (const f of manifest.files) {
      const target = join(dir, f.path)
      await mkdir(dirname(target), { recursive: true })
      const part = `${target}.part`
      const r = await fetchImpl(`${MODEL.base}${f.name}`)
      if (!r.ok || !r.body) throw new Error(`Model download failed for ${f.name} (${r.status})`)
      const hash = createHash('sha256')
      const out = createWriteStream(part)
      try {
        const reader = r.body.getReader()
        for (;;) {
          const { done: end, value } = await reader.read()
          if (end) break
          hash.update(value)
          if (!out.write(value)) await new Promise((ok) => out.once('drain', ok))
          loaded += value.length
          report()
        }
      } finally {
        await new Promise((ok) => out.end(ok))
      }
      if (hash.digest('hex') !== f.sha256) {
        await rm(part, { force: true })
        throw new Error(`Model file ${f.name} failed its checksum`)
      }
      await rename(part, target)
    }
    await writeFile(done, new Date().toISOString())
  }
  onDownload?.(100)
  await rm(join(cacheDir, OLD_MODEL_DIR), { recursive: true, force: true })
  return dir
}

/** Loads the model from a folder (as made by ensureModel) and returns an embedder running on the CPU. */
export async function loadSiglip(modelDir: string): Promise<Embedder> {
  const t = await import('@huggingface/transformers')
  t.env.allowRemoteModels = false
  t.env.allowLocalModels = true
  t.env.localModelPath = dirname(modelDir) + sep
  const id = modelDir.slice(dirname(modelDir).length + 1)
  const [processor, tokenizer, vision, text] = await Promise.all([
    t.AutoProcessor.from_pretrained(id),
    t.AutoTokenizer.from_pretrained(id),
    t.SiglipVisionModel.from_pretrained(id, { dtype: MODEL.visionDtype, device: 'cpu' }),
    t.SiglipTextModel.from_pretrained(id, { dtype: MODEL.textDtype, device: 'cpu' })
  ])

  async function load(path: string) {
    const { data, info } = await sharp(path)
      .rotate()
      .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: 'fill', fastShrinkOnLoad: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    return new t.RawImage(new Uint8ClampedArray(data), info.width, info.height, 3)
  }

  return {
    async embedImages(paths, onProgress) {
      const out: Float32Array[] = []
      for (let i = 0; i < paths.length; i += BATCH) {
        const batch = paths.slice(i, i + BATCH)
        const images = await Promise.all(batch.map(load))
        const inputs = await processor(images)
        const { pooler_output } = await vision(inputs)
        out.push(...rows(pooler_output.data as Float32Array, batch.length))
        onProgress?.(Math.min(paths.length, i + BATCH), paths.length)
      }
      return out
    },
    async embedTexts(texts) {
      const inputs = tokenizer(texts, { padding: 'max_length', truncation: true, max_length: TEXT_LENGTH })
      const { pooler_output } = await text(inputs)
      return rows(pooler_output.data as Float32Array, texts.length)
    }
  }
}

/** SigLIP 2 embedder: downloads the model into cacheDir on first use (reporting percentage), then works offline. */
export async function createSiglipEmbedder(cacheDir: string, onDownload?: (pct: number) => void): Promise<Embedder> {
  return loadSiglip(await ensureModel(cacheDir, onDownload))
}
