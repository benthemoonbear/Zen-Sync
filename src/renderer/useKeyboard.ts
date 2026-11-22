import { useEffect } from 'react'
import { appStore } from './state/store'

/** ←/→ step through photos; 1–9 send the selection to that part of the day. */
export function useKeyboard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const s = appStore().getState()
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') s.step(1)
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') s.step(-1)
      else if (/^[1-9]$/.test(e.key)) {
        const partId = s.partOrder[Number(e.key) - 1]
        if (partId) s.sendToPart(partId)
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
