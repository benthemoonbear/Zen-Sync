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

/** Muted colours for parts of the day, in list order. */
export const PART_COLOURS = [
  '#7a6fb0', '#b07a8c', '#6f8fb0', '#4f9a82', '#b08a4f', '#c06a4a', '#8aa05a', '#5a8fa0',
  '#a0705a', '#7a8a9a', '#9a6aa0', '#6aa08a', '#b0a04f', '#8f5a6a', '#5a6ab0'
]

export function partColour(index: number): string {
  return PART_COLOURS[((index % PART_COLOURS.length) + PART_COLOURS.length) % PART_COLOURS.length]
}
