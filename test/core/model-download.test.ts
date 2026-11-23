import { describe, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MODEL, ensureModel } from '../../src/main/core/embed'
import { tempDir } from '../helpers/jpeg'

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

function fakeRelease(files: Record<string, Buffer>, tamper: string[] = []) {
  const manifest = {
    files: Object.entries(files).map(([name, b]) => ({ name, path: name.endsWith('.onnx') ? `onnx/${name}` : name, size: b.length, sha256: sha(b) }))
  }
  const fetch = vi.fn(async (url: string) => {
    const name = url.slice(MODEL.base.length)
    if (name === 'manifest.json') return new Response(JSON.stringify(manifest))
    const b = files[name]
    if (!b) return new Response('missing', { status: 404 })
    return new Response(new Uint8Array(tamper.includes(name) ? Buffer.from('evil') : b))
  })
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls: fetch }
}

const files = {
  'config.json': Buffer.from('{"model_type":"siglip"}'),
  'tokenizer.json': Buffer.from('{}'),
  'vision_model.onnx': Buffer.alloc(3000, 1),
  'text_model_quantized.onnx': Buffer.alloc(1000, 2)
}

describe('model download', () => {
  test('the model comes from the Zen Sync GitHub release, SigLIP 2', () => {
    expect(MODEL.base).toBe('https://github.com/benthemoonbear/Zen-Sync/releases/download/model-siglip2-base-1/')
    expect(MODEL.id).toBe('siglip2-base-1')
  })

  test('downloads every file into the layout the model loader expects, reporting progress', async () => {
    const dir = await tempDir()
    const { fetch } = fakeRelease(files)
    const pcts: number[] = []
    const modelDir = await ensureModel(dir, (p) => pcts.push(p), fetch)
    expect(modelDir).toBe(join(dir, MODEL.id))
    expect(await readFile(join(modelDir, 'config.json'), 'utf8')).toContain('siglip')
    expect((await readFile(join(modelDir, 'onnx', 'vision_model.onnx'))).length).toBe(3000)
    expect(existsSync(join(modelDir, 'onnx', 'text_model_quantized.onnx'))).toBe(true)
    expect(pcts.at(-1)).toBe(100)
    expect(pcts).toEqual([...pcts].sort((a, b) => a - b))
  })

  test('a second start uses the files already downloaded', async () => {
    const dir = await tempDir()
    await ensureModel(dir, undefined, fakeRelease(files).fetch)
    const again = fakeRelease(files)
    await ensureModel(dir, undefined, again.fetch)
    expect(again.calls).not.toHaveBeenCalled()
  })

  test('a file that fails its checksum is rejected and nothing is marked complete', async () => {
    const dir = await tempDir()
    await expect(ensureModel(dir, undefined, fakeRelease(files, ['vision_model.onnx']).fetch)).rejects.toThrow(/checksum/i)
    expect(existsSync(join(dir, MODEL.id, '.complete'))).toBe(false)
    expect(existsSync(join(dir, MODEL.id, 'onnx', 'vision_model.onnx'))).toBe(false)
    // a later good download succeeds
    await ensureModel(dir, undefined, fakeRelease(files).fetch)
    expect(existsSync(join(dir, MODEL.id, '.complete'))).toBe(true)
  })

  test('a failed download (HTTP error) throws', async () => {
    const dir = await tempDir()
    const { 'tokenizer.json': _, ...rest } = files
    const broken = fakeRelease(rest)
    const manifestWithTokenizer = fakeRelease(files)
    const fetch = (async (url: string) =>
      url.endsWith('manifest.json') ? manifestWithTokenizer.fetch(url) : broken.fetch(url)) as typeof globalThis.fetch
    await expect(ensureModel(dir, undefined, fetch)).rejects.toThrow()
  })

  test('a manifest naming a path outside the model folder is refused', async () => {
    const dir = await tempDir()
    const fetch = (async () =>
      new Response(JSON.stringify({ files: [{ name: 'x', path: '../../evil', size: 1, sha256: 'a' }] }))) as unknown as typeof globalThis.fetch
    await expect(ensureModel(dir, undefined, fetch)).rejects.toThrow(/manifest/i)
  })

  test('the old SigLIP 1 download is removed once SigLIP 2 is in place', async () => {
    const dir = await tempDir()
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(dir, 'Xenova', 'siglip-base-patch16-224', 'onnx'), { recursive: true })
    await writeFile(join(dir, 'Xenova', 'siglip-base-patch16-224', 'onnx', 'model.onnx'), 'old')
    await ensureModel(dir, undefined, fakeRelease(files).fetch)
    expect(existsSync(join(dir, 'Xenova'))).toBe(false)
  })
})
