import { describe, expect, test } from 'vitest'
import { ACTIONS, DEFAULT_SHORTCUTS, assign, comboFromEvent, formatCombo, actionFor } from '../../src/renderer/shortcuts'

const ev = (key: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods }) as KeyboardEvent

describe('keyboard shortcuts', () => {
  test('arrow keys move, shift+arrows extend, and every action has a default', () => {
    expect(DEFAULT_SHORTCUTS.next).toBe('ArrowRight')
    expect(DEFAULT_SHORTCUTS.prev).toBe('ArrowLeft')
    expect(DEFAULT_SHORTCUTS.down).toBe('ArrowDown')
    expect(DEFAULT_SHORTCUTS.up).toBe('ArrowUp')
    expect(DEFAULT_SHORTCUTS.extendNext).toBe('Shift+ArrowRight')
    expect(DEFAULT_SHORTCUTS.selectAll).toBe('Mod+A')
    for (const a of ACTIONS) expect(DEFAULT_SHORTCUTS[a.id]).toBeTruthy()
  })

  test('a key press becomes a combo; Ctrl and Cmd both count as Mod; letters are upper-case', () => {
    expect(comboFromEvent(ev('a', { ctrlKey: true }))).toBe('Mod+A')
    expect(comboFromEvent(ev('a', { metaKey: true }))).toBe('Mod+A')
    expect(comboFromEvent(ev('ArrowRight', { shiftKey: true }))).toBe('Shift+ArrowRight')
    expect(comboFromEvent(ev('u'))).toBe('U')
    expect(comboFromEvent(ev('Shift', { shiftKey: true }))).toBeNull()
  })

  test('finds the action for a key press using the custom map', () => {
    const map = assign(DEFAULT_SHORTCUTS, 'next', 'D')
    expect(actionFor(map, ev('d'))).toBe('next')
    expect(actionFor(map, ev('ArrowRight'))).toBeNull()
    expect(actionFor(DEFAULT_SHORTCUTS, ev('3'))).toBe('part3')
  })

  test('giving a key to one action takes it away from any other', () => {
    const map = assign(DEFAULT_SHORTCUTS, 'nextUnsure', 'ArrowRight')
    expect(map.nextUnsure).toBe('ArrowRight')
    expect(map.next).toBe('')
  })

  test('combos read nicely', () => {
    expect(formatCombo('Mod+A', false)).toBe('Ctrl+A')
    expect(formatCombo('Mod+A', true)).toBe('⌘A')
    expect(formatCombo('Shift+ArrowRight', false)).toBe('Shift+→')
    expect(formatCombo('', false)).toBe('None')
  })
})
