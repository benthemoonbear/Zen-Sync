/**
 * Accuracy check against the hand-approved Bakewell order (test/fixtures/bakewell-order.txt).
 * Usage: npx tsx scripts/bakewell-eval.mts "/path/to/bakewell wedding"
 * Needs the real model (downloads ~400 MB the first time).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createSiglipEmbedder } from '../src/main/core/embed'
import { DEFAULT_PARTS } from '../src/main/core/parts'
import { applyClockFix, runSort } from '../src/main/core/pipeline'

const dir = process.argv[2]
if (!dir) throw new Error('Usage: bakewell-eval.mts <folder>')

const key = readFileSync(join(import.meta.dirname, '../test/fixtures/bakewell-order.txt'), 'utf8').split(/\s+/).filter(Boolean)
const embedder = await createSiglipEmbedder(join(homedir(), '.cache', 'wedding-sorter-models'), (p) => process.stdout.write(`\rmodel ${p}%`))
const started = Date.now()
let session = await runSort(dir, { embedder, parts: DEFAULT_PARTS, onProgress: (s, d, t) => process.stdout.write(`\r${s} ${d}/${t}   `) })
console.log(`\nsorted ${session.result.photos.length} photos in ${((Date.now() - started) / 1000).toFixed(1)} s`)

for (const c of session.result.clock) {
  const h = Math.floor(Math.abs(c.offsetMs) / 3_600_000)
  const m = Math.round((Math.abs(c.offsetMs) % 3_600_000) / 60_000)
  console.log(`clock suggestion: ${c.cameraId} ${c.offsetMs >= 0 ? '+' : '-'}${h}h${m}m from ${c.pairs} matching moment(s)`)
  session = applyClockFix(session, c.cameraId)
}

const got = session.result.photos.map((p) => p.name.replace(/\.jpe?g$/i, ''))
const pos = new Map(got.map((n, i) => [n, i]))
const within3 = key.filter((n, i) => pos.has(n) && Math.abs(pos.get(n)! - i) <= 3).length
let discordant = 0
let pairs = 0
for (let i = 0; i < key.length; i++)
  for (let j = i + 1; j < key.length; j++) {
    if (!pos.has(key[i]) || !pos.has(key[j])) continue
    pairs++
    if (pos.get(key[i])! > pos.get(key[j])!) discordant++
  }
console.log(`within ±3 places: ${within3}/${key.length} (${((within3 / key.length) * 100).toFixed(1)}%)`)
console.log(`pairs out of order (Kendall tau distance): ${((discordant / pairs) * 100).toFixed(1)}%`)
const counts = new Map<string, number>()
for (const p of session.result.photos) counts.set(p.partId, (counts.get(p.partId) ?? 0) + 1)
console.log('parts:', [...counts].map(([k, v]) => `${k} ${v}`).join(', '))
