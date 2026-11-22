import sharp from 'sharp'

export interface Embedder {
  embedImages(paths: string[], onProgress?: (done: number, total: number) => void): Promise<Float32Array[]>
  embedTexts(texts: string[]): Promise<Float32Array[]>
}

export const MODEL_ID = 'Xenova/siglip-base-patch16-224'
const IMAGE_SIZE = 224
const BATCH = 16

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

/**
 * SigLIP embedder running on the CPU via ONNX Runtime. Downloads the model into cacheDir
 * on first use (reporting overall percentage), then works offline.
 */
export async function createSiglipEmbedder(cacheDir: string, onDownload?: (pct: number) => void): Promise<Embedder> {
  const t = await import('@huggingface/transformers')
  t.env.cacheDir = cacheDir
  t.env.allowLocalModels = false

  const files = new Map<string, { loaded: number; total: number }>()
  const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== 'progress' || !p.file || !p.total) return
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
    let loaded = 0
    let total = 0
    for (const f of files.values()) {
      loaded += f.loaded
      total += f.total
    }
    onDownload?.(Math.min(100, Math.round((loaded / total) * 100)))
  }

  const opts = { cache_dir: cacheDir, dtype: 'fp32' as const, device: 'cpu' as const, progress_callback }
  const [processor, tokenizer, vision, text] = await Promise.all([
    t.AutoProcessor.from_pretrained(MODEL_ID, { cache_dir: cacheDir, progress_callback }),
    t.AutoTokenizer.from_pretrained(MODEL_ID, { cache_dir: cacheDir, progress_callback }),
    t.SiglipVisionModel.from_pretrained(MODEL_ID, opts),
    t.SiglipTextModel.from_pretrained(MODEL_ID, opts)
  ])
  onDownload?.(100)

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
      const inputs = tokenizer(texts, { padding: 'max_length', truncation: true })
      const { pooler_output } = await text(inputs)
      return rows(pooler_output.data as Float32Array, texts.length)
    }
  }
}
