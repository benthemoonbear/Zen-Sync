const MIN = 60_000
const DAY = 24 * 60 * MIN

export function clockText(label: string, offsetMs: number): string {
  const dir = offsetMs >= 0 ? 'slow' : 'fast'
  const abs = Math.abs(offsetMs)
  let amount: string
  if (abs >= 365 * DAY) amount = `about ${Math.round(abs / (365.25 * DAY))} years`
  else if (abs >= 2 * DAY) amount = `${Math.round(abs / DAY)} days`
  else {
    const h = Math.floor(abs / (60 * MIN))
    const m = Math.round((abs % (60 * MIN)) / MIN)
    amount = h ? `${h}h ${m}m` : `${m}m`
  }
  return `${label} clock looks ${amount} ${dir}`
}

/** Capture times are stored as naive wall-clock times in UTC fields. */
export function timeOfDay(ms: number | undefined): string {
  if (ms === undefined) return ''
  const d = new Date(ms)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export function folderName(dir: string): string {
  return dir.split(/[\\/]/).filter(Boolean).pop() ?? dir
}

/** The light of the day, from morning gold through afternoon amber and rose to dusk and night blue. */
const DAYLIGHT = ['#e9c98e', '#e3a96e', '#cf8a72', '#b97a8a', '#a78db1', '#4a5486', '#3f4a78']

const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0')
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

/** Colour for the part at `index` of `total` parts: its place along the day's light. */
export function partColour(index: number, total = 15): string {
  const n = Math.max(1, total)
  const i = Math.min(Math.max(index, 0), n - 1)
  const t = n === 1 ? 0 : i / (n - 1)
  const pos = t * (DAYLIGHT.length - 1)
  const k = Math.min(Math.floor(pos), DAYLIGHT.length - 2)
  const f = pos - k
  const [a, b] = [rgb(DAYLIGHT[k]), rgb(DAYLIGHT[k + 1])]
  let c = a.map((v, j) => v + (b[j] - v) * f)
  // Mid-tones between light and dark can't carry readable text: nudge them to whichever side is nearer.
  const goDark = luminance(c) < 0.2
  for (let step = 0; step < 20 && labelContrast(c) < 4.6; step++) {
    c = c.map((v) => (goDark ? v * 0.96 : v + (255 - v) * 0.04))
  }
  return '#' + c.map(hex).join('')
}

function luminance(c: number[]): number {
  const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const INK_L = luminance(rgb('#161417'))
const LIGHT_L = luminance(rgb('#f6f1e7'))

function labelContrast(c: number[]): number {
  const l = luminance(c)
  return Math.max((l + 0.05) / (INK_L + 0.05), (LIGHT_L + 0.05) / (l + 0.05))
}

/** Readable label colour (dark ink or light) for text on a part colour. */
export function textOn(bg: string): string {
  const l = luminance(rgb(bg))
  return (l + 0.05) / (INK_L + 0.05) >= (LIGHT_L + 0.05) / (l + 0.05) ? '#161417' : '#f6f1e7'
}
