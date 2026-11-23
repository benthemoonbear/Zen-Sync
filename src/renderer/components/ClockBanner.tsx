import { useState } from 'react'
import { clockText } from '../format'
import { appStore, useApp } from '../state/store'

export function ClockBanner() {
  const result = useApp((s) => s.result)
  const edited = useApp((s) => s.edited)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [confirming, setConfirming] = useState<string | null>(null)
  if (!result) return null
  const shown = result.clock.filter((c) => !dismissed.includes(c.cameraId))

  async function fix(cameraId: string) {
    setConfirming(null)
    const next = await window.api.applyClockFix(cameraId)
    appStore().getState().replaceResult(next)
  }

  return (
    <>
      {shown.map((c) => {
        const label = result.cameras.find((x) => x.id === c.cameraId)?.label ?? c.cameraId
        return (
          <div className="banner" key={c.cameraId} role="status">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 4.75V8l2.25 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>
              {confirming === c.cameraId
                ? 'Fixing the clock re-sorts the photos and undoes your changes. Fix anyway?'
                : clockText(label, c.offsetMs)}
            </span>
            <button onClick={() => (edited && confirming !== c.cameraId ? setConfirming(c.cameraId) : fix(c.cameraId))}>Fix</button>
            <button className="ghost" onClick={() => (confirming ? setConfirming(null) : setDismissed([...dismissed, c.cameraId]))}>
              {confirming === c.cameraId ? 'Cancel' : 'Ignore'}
            </button>
          </div>
        )
      })}
    </>
  )
}
