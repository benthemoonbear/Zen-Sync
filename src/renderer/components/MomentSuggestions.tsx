import { useState } from 'react'
import { appStore, useApp } from '../state/store'

/** Moments Zen Sync found that aren't on the parts list (e.g. fireworks): add each as a part, or dismiss it. */
export function MomentSuggestions() {
  const moments = useApp((s) => s.result?.moments)
  const [done, setDone] = useState<Set<string>>(new Set())
  const showing = (moments ?? []).filter((m) => !done.has(m.name))
  if (!showing.length) return null
  const finish = (name: string) => setDone(new Set(done).add(name))

  function add(m: (typeof showing)[number]) {
    const s = appStore().getState()
    const present = new Set(s.photos.map((p) => p.path))
    const paths = m.paths.filter((p) => present.has(p))
    if (paths.length) {
      s.selectPaths(paths, false)
      s.newPartWithSelection(m.afterPartId && s.partOrder.includes(m.afterPartId) ? m.afterPartId : null, m.name)
    }
    finish(m.name)
  }

  return (
    <>
      {showing.map((m) => (
        <div className="banner moment" key={m.name} role="status">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 1.5l1.6 4.1 4.4.3-3.4 2.8 1.1 4.3L8 10.6 4.3 13l1.1-4.3L2 5.9l4.4-.3z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
          <span>
            Found a moment that isn't on your list: <b>{m.name}</b>, {m.paths.length} photos
          </span>
          <button className="ghost" onClick={() => appStore().getState().selectPaths(m.paths, false)}>Show</button>
          <button aria-label={`Add ${m.name} as a part`} onClick={() => add(m)}>Add as a part</button>
          <button className="ghost" aria-label={`Dismiss ${m.name}`} onClick={() => finish(m.name)}>Dismiss</button>
        </div>
      ))}
    </>
  )
}
