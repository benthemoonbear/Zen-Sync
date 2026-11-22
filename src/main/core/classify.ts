import { cosine, normalise, type Embedder } from './embed'
import type { Part } from './types'

export const UNSURE_MARGIN = 0.15

/** One embedding per part: the mean of its prompt embeddings, renormalised. */
export async function partTextEmbeddings(parts: Part[], e: Embedder): Promise<Float32Array[]> {
  const all = await e.embedTexts(parts.flatMap((p) => p.prompts))
  let i = 0
  return parts.map((p) => {
    const sum = new Float32Array(all[0]?.length ?? 0)
    for (let k = 0; k < p.prompts.length; k++, i++) all[i].forEach((x, d) => (sum[d] += x))
    return normalise(sum)
  })
}

/** Softmax over cosine/temperature: each row is a probability per part. */
export function scoreParts(images: Float32Array[], partEmbs: Float32Array[], temperature = 0.01): number[][] {
  return images.map((img) => {
    const logits = partEmbs.map((pe) => cosine(img, pe) / temperature)
    const max = Math.max(...logits)
    const exps = logits.map((l) => Math.exp(l - max))
    const total = exps.reduce((a, b) => a + b, 0)
    return exps.map((x) => x / total)
  })
}

export function isUnsure(row: number[]): boolean {
  const [first, second = 0] = [...row].sort((a, b) => b - a)
  return first - second < UNSURE_MARGIN
}

export function argmax(row: number[]): number {
  let best = 0
  for (let i = 1; i < row.length; i++) if (row[i] > row[best]) best = i
  return best
}
