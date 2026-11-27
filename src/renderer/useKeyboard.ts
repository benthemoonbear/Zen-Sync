import { useEffect } from 'react'
import { appStore } from './state/store'
import { useShortcuts } from './state/shortcuts'
import { actionFor } from './shortcuts'

/** How many thumbnails fit across a row, so ↑/↓ move by a row. */
function columns(): number {
  const grid = document.querySelector('.tiles')
  if (!grid) return 1
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length
  return Math.max(1, cols)
}

/** Keyboard shortcuts on the review screen, using the person's own key map. */
export function useKeyboard(enabled: boolean, handlers: { onSave(): void; onSettings(): void }): void {
  useEffect(() => {
    void useShortcuts.getState().load()
  }, [])
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const action = actionFor(useShortcuts.getState().map, e)
      if (!action) return
      const s = appStore().getState()
      switch (action) {
        case 'next': s.step(1); break
        case 'prev': s.step(-1); break
        case 'down': s.step(columns()); break
        case 'up': s.step(-columns()); break
        case 'extendNext': s.step(1, true); break
        case 'extendPrev': s.step(-1, true); break
        case 'selectAll': s.selectAll(); break
        case 'clearSelection': s.clearSelection(); break
        case 'nextUnsure': s.goNextUnsure(); break
        case 'save': handlers.onSave(); break
        case 'settings': handlers.onSettings(); break
        default: {
          const partId = s.partOrder[Number(action.slice(4)) - 1]
          if (partId) s.sendToPart(partId)
        }
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, handlers])
}
