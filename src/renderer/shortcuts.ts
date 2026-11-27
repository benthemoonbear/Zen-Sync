/** Keyboard shortcuts: actions, their default keys, and helpers to read and edit a custom map. */

export const ACTIONS = [
  { id: 'next', label: 'Next photo' },
  { id: 'prev', label: 'Previous photo' },
  { id: 'down', label: 'Photo below' },
  { id: 'up', label: 'Photo above' },
  { id: 'extendNext', label: 'Add next photo to selection' },
  { id: 'extendPrev', label: 'Add previous photo to selection' },
  { id: 'selectAll', label: 'Select all photos' },
  { id: 'clearSelection', label: 'Select just the current photo' },
  { id: 'nextUnsure', label: 'Next unsure photo' },
  { id: 'save', label: 'Save copies' },
  { id: 'settings', label: 'Open Settings' },
  { id: 'part1', label: 'Move selection to part 1' },
  { id: 'part2', label: 'Move selection to part 2' },
  { id: 'part3', label: 'Move selection to part 3' },
  { id: 'part4', label: 'Move selection to part 4' },
  { id: 'part5', label: 'Move selection to part 5' },
  { id: 'part6', label: 'Move selection to part 6' },
  { id: 'part7', label: 'Move selection to part 7' },
  { id: 'part8', label: 'Move selection to part 8' },
  { id: 'part9', label: 'Move selection to part 9' }
] as const

export type ActionId = (typeof ACTIONS)[number]['id']
export type ShortcutMap = Record<ActionId, string>

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  next: 'ArrowRight',
  prev: 'ArrowLeft',
  down: 'ArrowDown',
  up: 'ArrowUp',
  extendNext: 'Shift+ArrowRight',
  extendPrev: 'Shift+ArrowLeft',
  selectAll: 'Mod+A',
  clearSelection: 'Escape',
  nextUnsure: 'U',
  save: 'Mod+S',
  settings: 'Mod+,',
  part1: '1',
  part2: '2',
  part3: '3',
  part4: '4',
  part5: '5',
  part6: '6',
  part7: '7',
  part8: '8',
  part9: '9'
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Meta', 'Alt', 'AltGraph', 'CapsLock'])

/** "Mod+Shift+A" style combo for a key press, or null for a bare modifier. Ctrl and Cmd both count as Mod. */
export function comboFromEvent(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Mod')
  if (e.altKey) parts.push('Alt')
  // Shift is part of a combo except where it only changes which character a key types (e.g. "?").
  if (e.shiftKey && (key.length > 1 || /^[A-Z0-9]$/.test(key))) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}

/** The action a key press triggers under this map, if any. */
export function actionFor(map: ShortcutMap, e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): ActionId | null {
  const combo = comboFromEvent(e)
  if (!combo) return null
  for (const a of ACTIONS) if (map[a.id] === combo) return a.id
  return null
}

/** Gives `combo` to `action`, taking it away from whichever action had it. */
export function assign(map: ShortcutMap, action: ActionId, combo: string): ShortcutMap {
  const next = { ...map }
  for (const a of ACTIONS) if (next[a.id] === combo) next[a.id] = ''
  next[action] = combo
  return next
}

/** Fills in any action missing from a saved map (e.g. one added in a newer version). */
export function withDefaults(saved: Partial<ShortcutMap> | null | undefined): ShortcutMap {
  return { ...DEFAULT_SHORTCUTS, ...(saved ?? {}) }
}

const KEY_NAMES: Record<string, string> = {
  ArrowRight: '→', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Space: 'Space', Enter: 'Enter', Backspace: '⌫', Delete: 'Del'
}

/** Human-readable combo: "Ctrl+A" on Windows/Linux, "⌘A" on a Mac. */
export function formatCombo(combo: string, mac: boolean): string {
  if (!combo) return 'None'
  const parts = combo.split('+').map((p, i, all) => (i === all.length - 1 && p === '' ? '+' : p)).filter(Boolean)
  const mods = parts.slice(0, -1)
  const key = KEY_NAMES[parts.at(-1)!] ?? parts.at(-1)!
  if (mac) {
    const sym: Record<string, string> = { Mod: '⌘', Shift: '⇧', Alt: '⌥' }
    return mods.map((m) => sym[m] ?? m).join('') + key
  }
  return [...mods.map((m) => (m === 'Mod' ? 'Ctrl' : m)), key].join('+')
}
