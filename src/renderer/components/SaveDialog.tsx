import { useEffect, useState } from 'react'
import type { SaveMode } from '../../main/core/types'
import { useApp } from '../state/store'
import { UnlockPanel } from './UnlockDialog'

const FREE_PHOTO_LIMIT = 250
const NO_CLIPS: never[] = []

type View = { kind: 'choose' } | { kind: 'unlock'; reason?: string } | { kind: 'exists' } | { kind: 'saving' } | { kind: 'done'; written: number; clips: number; outDir: string } | { kind: 'error'; message: string }

export function SaveDialog({ onClose }: { onClose: () => void }) {
  const dir = useApp((s) => s.dir)
  const photos = useApp((s) => s.photos)
  const parts = useApp((s) => s.parts)
  const [licensed, setLicensed] = useState(false)
  const [mode, setMode] = useState<SaveMode>('single')
  const [view, setView] = useState<View>({ kind: 'choose' })
  const [keepInSync, setKeepInSync] = useState(true)
  const clips = useApp((s) => s.result?.clips ?? NO_CLIPS)
  const [copyClips, setCopyClips] = useState(true)
  const [timecode, setTimecode] = useState(true)

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
      const video = clips.length ? { copy: copyClips, timecode } : undefined
      const r = await window.api.save({ dir: dir!, photos, parts, mode, overwrite, keepInSync, ...(video ? { video } : {}) })
      if ('exists' in r) setView({ kind: 'exists' })
      else if ('blocked' in r) setView({ kind: 'unlock', reason: r.blocked === 'limit' ? 'Free version saves up to 250 photos' : 'Folder per part is part of the full version' })
      else setView({ kind: 'done', written: r.written - (r.clips ?? 0), clips: r.clips ?? 0, outDir: r.outDir })
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
                <span className="label">
                  One folder<div className="sub">1.jpg to {photos.length}.jpg through the day</div>
                </span>
              </label>
              <label className={`choice${mode === 'perPart' ? ' on' : ''}`}>
                <input type="radio" name="mode" checked={mode === 'perPart'} onChange={() => pick('perPart')} />
                <span className="label">
                  Folder per part<div className="sub">Folders and sub-folders for each part, numbering runs on</div>
                </span>
                {!licensed && <span className="lock">Full version, £14.99</span>}
              </label>
              <label className="sync-toggle">
                <input type="checkbox" checked={keepInSync} onChange={(e) => setKeepInSync(e.target.checked)} />
                <span>
                  Keep in sync
                  <span className="sub">Photos added to this folder later are put in order and the numbered copies updated, even with the window closed.</span>
                </span>
              </label>
              {clips.length > 0 && (
                <fieldset className="video-options">
                  <legend>Video</legend>
                  <label className="sync-toggle">
                    <input type="checkbox" checked={copyClips} onChange={(e) => setCopyClips(e.target.checked)} />
                    <span>
                      Copy the {clips.length === 1 ? 'video clip' : `${clips.length} video clips`}
                      <span className="sub">Placed with the photos by time and numbered V001, V002… Linked, not copied, where the drive allows, so they take no extra space.</span>
                    </span>
                  </label>
                  <label className="sync-toggle">
                    <input type="checkbox" checked={timecode} onChange={(e) => setTimecode(e.target.checked)} />
                    <span>
                      Write timecode lists for editing
                      <span className="sub">An EDL of the day in order for Premiere or Resolve, part markers for Resolve, and a CSV, in numbered/Timecode.</span>
                    </span>
                  </label>
                </fieldset>
              )}
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
              <p>
                Saved {view.written} photos
                {view.clips > 0 && ` and ${view.clips === 1 ? '1 video clip' : `${view.clips} video clips`}`} to numbered
              </p>
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
