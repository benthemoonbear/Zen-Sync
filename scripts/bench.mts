/**
 * Speed check: copies the photos in <folder> up to <n> files in a temp folder and times a full sort.
 * Usage: npx tsx scripts/bench.mts "/path/to/wedding" 1000
 */
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSiglipEmbedder } from '../src/main/core/embed'
import { DEFAULT_PARTS } from '../src/main/core/parts'
import { runSort } from '../src/main/core/pipeline'

const [dir, nArg] = process.argv.slice(2)
const n = Number(nArg ?? 1000)
if (!dir) throw new Error('Usage: bench.mts <folder> [n]')
const src = (await readdir(dir)).filter((f) => /\.jpe?g$/i.test(f))
const tmp = await mkdtemp(join(tmpdir(), 'wps-bench-'))
for (let i = 0; i < n; i++) await copyFile(join(dir, src[i % src.length]), join(tmp, `IMG${String(i).padStart(5, '0')}.jpg`))
const embedder = await createSiglipEmbedder(join(homedir(), '.cache', 'wedding-sorter-models'))
const t = Date.now()
const { result } = await runSort(tmp, { embedder, parts: DEFAULT_PARTS, onProgress: (s, d, tot) => process.stdout.write(`\r${s} ${d}/${tot}   `) })
console.log(`\n${result.photos.length} photos sorted in ${((Date.now() - t) / 1000).toFixed(1)} s (target < 300 s)`)
await rm(tmp, { recursive: true, force: true })
