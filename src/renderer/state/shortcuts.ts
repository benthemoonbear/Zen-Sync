import { create } from 'zustand'
import { DEFAULT_SHORTCUTS, withDefaults, type ShortcutMap } from '../shortcuts'

interface ShortcutState {
  map: ShortcutMap
  load(): Promise<void>
  save(map: ShortcutMap): Promise<void>
}

/** The keyboard shortcuts in use: defaults, overlaid with whatever the person saved in Settings. */
export const useShortcuts = create<ShortcutState>()((set) => ({
  map: DEFAULT_SHORTCUTS,
  async load() {
    set({ map: withDefaults((await window.api.getShortcuts()) as Partial<ShortcutMap>) })
  },
  async save(map) {
    set({ map })
    await window.api.setShortcuts(map)
  }
}))
