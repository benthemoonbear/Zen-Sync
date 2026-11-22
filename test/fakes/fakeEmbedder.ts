import { basename } from 'node:path'
import { normalise, type Embedder } from '../../src/main/core/embed'

/** Test embedder: vectors looked up by file name (images) or exact text (prompts). */
export class FakeEmbedder implements Embedder {
  constructor(private readonly vectors: Record<string, number[]>, private readonly dim = 4) {}

  private lookup(key: string): Float32Array {
    const v = this.vectors[key]
    if (!v) return normalise(new Float32Array(this.dim).fill(1))
    return normalise(Float32Array.from(v))
  }

  async embedImages(paths: string[], onProgress?: (done: number, total: number) => void): Promise<Float32Array[]> {
    const out = paths.map((p) => this.lookup(basename(p)))
    onProgress?.(paths.length, paths.length)
    return out
  }

  async embedTexts(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => this.lookup(t))
  }
}
