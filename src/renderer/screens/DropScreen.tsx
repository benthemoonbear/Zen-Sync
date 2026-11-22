import { useEffect, useState, type DragEvent } from 'react'
import type { Progress } from '../../shared/api'
import { appStore } from '../state/store'

function progressText(p: Progress | null): string {
  if (!p) return 'Getting ready…'
  if (p.stage === 'scan') return 'Reading the folder…'
  if (p.stage === 'analyse') return `Analysing ${p.done} of ${p.total}`
  return 'Putting the day in order…'
}

export function DropScreen() {
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [download, setDownload] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const offP = window.api.onProgress((p) => {
      setProgress(p)
      if (p.stage !== 'scan') setDownload(null)
    })
    const offD = window.api.onModelDownload(setDownload)
    return () => {
      offP()
      offD()
    }
  }, [])

  async function sort(dir: string) {
    setBusy(true)
    setError(null)
    setProgress(null)
    try {
      const result = await window.api.sort(dir)
      if (!result.photos.length) {
        setError('No JPEG photos were found in that folder.')
        return
      }
      appStore().getState().load(dir, result)
    } catch (e) {
      setError(
        String((e as Error)?.message ?? '').includes('MODEL_DOWNLOAD_FAILED')
          ? "Couldn't download the photo model. Check your internet connection and try again — it's only needed once."
          : "Couldn't sort that folder. Check it contains finished JPEGs and try again."
      )
    } finally {
      setBusy(false)
    }
  }

  async function choose() {
    const dir = await window.api.chooseFolder()
    if (dir) await sort(dir)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file || busy) return
    const path = window.api.pathForFile(file)
    if (path) void sort(path)
  }

  const downloading = download !== null && download < 100
  const pct = downloading ? download! : progress?.stage === 'analyse' && progress.total ? (progress.done / progress.total) * 100 : progress?.stage === 'arrange' ? 100 : 4

  return (
    <div className="drop">
      <div
        data-testid="dropzone"
        className={`drop-zone${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {busy ? (
          <>
            <h1>{downloading ? `Downloading the photo model (one time only) — ${download}%` : progressText(progress)}</h1>
            <div className="progress">
              <div style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} />
            </div>
            <p>Your photos never leave this computer.</p>
          </>
        ) : (
          <>
            <h1>Drag a folder of finished JPEGs here</h1>
            <p>or</p>
            <button className="primary" onClick={choose}>
              Choose folder
            </button>
            {error && <p className="error">{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
