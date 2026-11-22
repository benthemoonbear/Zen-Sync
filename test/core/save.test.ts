import { describe, expect, test } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { planOutput, writeCopies } from '../../src/main/core/save'
import { tempDir, writeJpeg } from '../helpers/jpeg'
import type { Part, SortedPhoto } from '../../src/main/core/types'

const parts: Part[] = [
  { id: 'arrival', name: 'Arrival and guests', prompts: [] },
  { id: 'ceremony', name: 'Ceremony', prompts: [] },
  { id: 'cake', name: 'Cake / cutting', prompts: [] }
]
const sp = (dir: string, name: string, partId: string): SortedPhoto => ({ path: join(dir, name), name, cameraId: 'c', partId, unsure: false })
const sha = async (p: string) => createHash('sha256').update(await readFile(p)).digest('hex')

describe('planOutput', () => {
  test('single mode names 1.jpg..N.jpg with no padding', () => {
    const photos = Array.from({ length: 12 }, (_, i) => sp('/in', `x${i}.jpg`, 'arrival'))
    const plan = planOutput(photos, parts, 'single')
    expect(plan.map((p) => p.rel)).toEqual(Array.from({ length: 12 }, (_, i) => `${i + 1}.jpg`))
  })

  test('perPart folders are numbered among non-empty parts and numbering runs on', () => {
    const photos = [
      sp('/in', 'a.jpg', 'arrival'), sp('/in', 'b.jpg', 'arrival'), sp('/in', 'c.jpg', 'arrival'),
      sp('/in', 'd.jpg', 'cake'), sp('/in', 'e.jpg', 'cake')
    ]
    expect(planOutput(photos, parts, 'perPart').map((p) => p.rel)).toEqual([
      '01 Arrival and guests/1.jpg', '01 Arrival and guests/2.jpg', '01 Arrival and guests/3.jpg',
      '02 Cake cutting/4.jpg', '02 Cake cutting/5.jpg'
    ])
  })

  test('grouped parts go into sub-folders inside their group, numbered within it', () => {
    const grouped: Part[] = [
      { id: 'prep', name: 'Getting ready', group: 'Morning', prompts: [] },
      { id: 'ceremony', name: 'Ceremony', group: 'Ceremony', prompts: [] },
      { id: 'signing', name: 'Signing', group: 'Ceremony', prompts: [] },
      { id: 'cake', name: 'Cake', prompts: [] }
    ]
    const photos = [
      sp('/in', 'a.jpg', 'prep'), sp('/in', 'b.jpg', 'ceremony'), sp('/in', 'c.jpg', 'signing'),
      sp('/in', 'd.jpg', 'cake'), sp('/in', 'e.jpg', 'prep')
    ]
    expect(planOutput(photos, grouped, 'perPart').map((p) => p.rel)).toEqual([
      '01 Morning/01 Getting ready/1.jpg',
      '02 Ceremony/01 Ceremony/2.jpg',
      '02 Ceremony/02 Signing/3.jpg',
      '03 Cake/4.jpg',
      '01 Morning/01 Getting ready/5.jpg'
    ])
  })

  test('a blank or unsafe group name counts as no group', () => {
    const odd: Part[] = [{ id: 'x', name: 'X', group: '  ', prompts: [] }, { id: 'y', name: 'Y', group: 'A/B:', prompts: [] }]
    expect(planOutput([sp('/in', 'a.jpg', 'x'), sp('/in', 'b.jpg', 'y')], odd, 'perPart').map((p) => p.rel)).toEqual([
      '01 X/1.jpg', '02 AB/01 Y/2.jpg'
    ])
  })
})

describe('writeCopies', () => {
  async function setup(name = 'wedding') {
    const dir = await tempDir(name)
    const photos = [sp(dir, 'B.jpg', 'arrival'), sp(dir, 'A.jpg', 'ceremony')]
    await writeJpeg(dir, 'A.jpg', { colour: { r: 1, g: 2, b: 3 } })
    await writeJpeg(dir, 'B.jpg', { colour: { r: 9, g: 8, b: 7 } })
    return { dir, photos }
  }
  const opts = { overwrite: false, mode: 'single' as const, licensed: false }

  test('copies are byte-identical', async () => {
    const { dir, photos } = await setup()
    const r = await writeCopies(dir, planOutput(photos, parts, 'single'), opts)
    expect(r).toEqual({ written: 2 })
    expect(await sha(join(dir, 'numbered', '1.jpg'))).toBe(await sha(join(dir, 'B.jpg')))
    expect(await sha(join(dir, 'numbered', '2.jpg'))).toBe(await sha(join(dir, 'A.jpg')))
  })

  test('returns exists when numbered/ exists and overwrite is false; overwrite replaces only numbered/', async () => {
    const { dir, photos } = await setup()
    await mkdir(join(dir, 'numbered'))
    await writeFile(join(dir, 'numbered', 'old.txt'), 'old')
    await writeFile(join(dir, 'notes.txt'), 'keep me')
    const before = { a: await sha(join(dir, 'A.jpg')), aTime: (await stat(join(dir, 'A.jpg'))).mtimeMs }
    const plan = planOutput(photos, parts, 'single')
    expect(await writeCopies(dir, plan, opts)).toEqual({ exists: true })
    expect(await readdir(join(dir, 'numbered'))).toEqual(['old.txt'])
    expect(await writeCopies(dir, plan, { ...opts, overwrite: true })).toEqual({ written: 2 })
    expect((await readdir(join(dir, 'numbered'))).sort()).toEqual(['1.jpg', '2.jpg'])
    expect(await readFile(join(dir, 'notes.txt'), 'utf8')).toBe('keep me')
    expect(await sha(join(dir, 'A.jpg'))).toBe(before.a)
    expect((await stat(join(dir, 'A.jpg'))).mtimeMs).toBe(before.aTime)
    expect((await readdir(dir)).filter((n) => n.startsWith('numbered.tmp'))).toEqual([])
  })

  test('works with spaces and non-ASCII in input path', async () => {
    const { dir, photos } = await setup('Zoë & Tom wedding')
    expect(await writeCopies(dir, planOutput(photos, parts, 'perPart'), { ...opts, mode: 'perPart', licensed: true })).toEqual({ written: 2 })
    expect(await readdir(join(dir, 'numbered'))).toEqual(['01 Arrival and guests', '02 Ceremony'])
  })

  test('writeCopies re-checks the free limit and throws if not allowed', async () => {
    const { dir, photos } = await setup()
    await expect(writeCopies(dir, planOutput(photos, parts, 'perPart'), { ...opts, mode: 'perPart' })).rejects.toThrow(/locked/i)
    const many = Array.from({ length: 251 }, (_, i) => ({ src: photos[0].path, rel: `${i + 1}.jpg` }))
    await expect(writeCopies(dir, many, opts)).rejects.toThrow(/250/)
    await expect(stat(join(dir, 'numbered'))).rejects.toThrow()
  })
})
