/**
 * Loads the converted model exactly as Zen Sync does (loadSiglip) and compares it with the PyTorch
 * reference written by convert_siglip2.py.
 *
 *   npx tsx model/verify_in_app.mts out/
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MODEL, cosine, loadSiglip, normalise } from '../src/main/core/embed'

const out = process.argv[2] ?? 'out'
const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8')) as { files: { name: string; path: string }[] }
const ref = JSON.parse(await readFile(join(out, 'reference.json'), 'utf8')) as {
  texts: string[]; image_url: string; image: number[]; text: number[][]; input_ids: number[][]
}

// Lay the files out the way ensureModel does.
const root = join(tmpdir(), `zen-model-${Date.now()}`)
const dir = join(root, MODEL.id)
for (const f of manifest.files) {
  await mkdir(join(dir, f.path, '..'), { recursive: true })
  await copyFile(join(out, f.name), join(dir, f.path))
}

const img = join(root, 'cats.jpg')
await writeFile(img, Buffer.from(await (await fetch(ref.image_url)).arrayBuffer()))

const e = await loadSiglip(dir)
const [v] = await e.embedImages([img])
const t = await e.embedTexts(ref.texts)

const { AutoTokenizer, env } = await import('@huggingface/transformers')
env.localModelPath = root + '/'
const tok = await AutoTokenizer.from_pretrained(MODEL.id)
const ids = tok(ref.texts, { padding: 'max_length', truncation: true, max_length: 64 }).input_ids.tolist().map((r: bigint[]) => r.map(Number))

const f32 = (a: number[]) => normalise(Float32Array.from(a))
const imageAgreement = cosine(v, f32(ref.image))
const textAgreement = Math.min(...t.map((x, i) => cosine(x, f32(ref.text[i]))))
const sims = t.map((x) => cosine(v, x))
const idsMatch = JSON.stringify(ids) === JSON.stringify(ref.input_ids)

console.log({ imageAgreement, textAgreement, idsMatch, sims })
const fail: string[] = []
if (!idsMatch) fail.push('tokenizer gives different token ids from Python')
if (imageAgreement < 0.97) fail.push(`photo embedding differs from PyTorch (${imageAgreement.toFixed(4)})`)
if (textAgreement < 0.98) fail.push(`text embedding differs from PyTorch (${textAgreement.toFixed(4)})`)
if (sims.indexOf(Math.max(...sims)) !== 0) fail.push('the app does not pick the cats caption for the cats photo')
if (fail.length) {
  console.error('FAILED:\n- ' + fail.join('\n- '))
  process.exit(1)
}
console.log('In-app check passed.')
