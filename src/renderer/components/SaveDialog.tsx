import { useEffect, useState } from 'react'
import type { SaveMode } from '../../main/core/types'
import { useApp } from '../state/store'
import { UnlockPanel } from './UnlockDialog'

const FREE_PHOTO_LIMIT = 250

type View = { kind: 'choose' } | { kind: 'unlock'; reason?: string } | { kind: 'exists' } | { kind: 'saving' } | { kind: 'done'; written: number; outDir: string } | { kind: 'error'; message: string }

export function SaveDialog({ onClose }: { onClose: () => void }) {
  const dir = useApp((s) => s.dir)
  const photos = useApp((s) => s.photos)
  const parts = useApp((s) => s.parts)
  const [licensed, setLicensed] = useState(false)
  const [mode, setMode] = useState<SaveMode>('single')
  const [view, setView] = useState<View>({ kind: 'choose' })

  useEffect(() => {
    void window.api.licence().then((l) => setLicensed(l.licensed))
  }, [])

  function pick(next: SaveMode) {
    if (next === 'perPart' && !licensed) return setView({ kind: 'unlock', reason: 'Folder per part is part of the full version' })
    setMode(next)
  }

  async function save(overwrite: boolean) {
    if (!licensed && photos.length > FREE_PHOTO_LIMIT) return setView({ kind: 'unlock', reason: 'Free version saves up to 250 photos' })
    setView({ kind: 'saving' })
    try {
      const r = await window.api.save({ dir: dir!, photos, parts, mode, overwrite })
      if ('exists' in r) setView({ kind: 'exists' })
      else if ('blocked' in r) setView({ kind: 'unlock', reason: r.blocked === 'limit' ? 'Free version saves up to 250 photos' : 'Folder per part is part of the full version' })
      else setView({ kind: 'done', written: r.written, outDir: r.outDir })
    } catch {
      setView({ kind: 'error', message: "Couldn't save the copies. Check there's enough space and that the folder isn't read-only." })
    }
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && view.kind !== 'saving' && onClose()}>
      {view.kind === 'unlock' ? (
        <UnlockPanel
          reason={view.reason}
          onClose={() => setView({ kind: 'choose' })}
          onUnlocked={() => {
            setLicensed(true)
            setView({ kind: 'choose' })
          }}
        />
      ) : (
        <div className="dialog">
          <h2>Save numbered copies</h2>
          {view.kind === 'choose' && (
            <>
              <p>Copies go into a new folder called “numbered” inside this one. Your originals aren't changed.</p>
              <label className={`choice${mode === 'single' ? ' on' : ''}`}>
                <input type="radio" name="mode" checked={mode === 'single'} onChange={() => pick('single')} />
                <span>
                  One folder<div className="sub">1.jpg to {photos.length}.jpg through the day</div>
                </span>
              </label>
              <label className={`choice${mode === 'perPart' ? ' on' : ''}`}>
                <input type="radio" name="mode" checked={mode === 'perPart'} onChange={() => pick('perPart')} />
                <span>
                  Folder per part<div className="sub">01 Getting ready, 02 Details… numbering runs on</div>
                </span>
                {!licensed && <span className="lock">Full version · £14.99</span>}
              </label>
              {!licensed && photos.length > FREE_PHOTO_LIMIT && <p className="hint">The free version saves up to 250 photos. This wedding has {photos.length}.</p>}
              <div className="actions">
                <button className="ghost" onClick={onClose}>Cancel</button>
                <button className="primary" onClick={() => save(false)}>Save</button>
              </div>
            </>
          )}
          {view.kind === 'exists' && (
            <>
              <p>A numbered folder is already here. Replace it?</p>
              <div className="actions">
                <button className="ghost" onClick={() => setView({ kind: 'choose' })}>Cancel</button>
                <button className="primary" onClick={() => save(true)}>Replace</button>
              </div>
            </>
          )}
          {view.kind === 'saving' && <p>Saving copies…</p>}
          {view.kind === 'done' && (
            <>
              <p>Saved {view.written} photos to numbered</p>
              <div className="actions">
                <button onClick={() => window.api.showFolder(view.outDir)}>Show folder</button>
                <button className="primary" onClick={onClose}>Done</button>
              </div>
            </>
          )}
          {view.kind === 'error' && (
            <>
              <p className="error">{view.message}</p>
              <div className="actions">
                <button onClick={() => setView({ kind: 'choose' })}>Back</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
