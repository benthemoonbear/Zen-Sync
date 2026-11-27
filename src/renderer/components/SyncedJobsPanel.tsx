import { useEffect, useState } from 'react'

type JobRow = { dir: string; name: string; photos: number; savedAt: number }

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Settings › Synced jobs: saved jobs Zen Sync keeps up to date as photos are added. */
export function SyncedJobsPanel() {
  const [jobs, setJobs] = useState<JobRow[] | null>(null)
  const load = () => void window.api.syncedJobs().then(setJobs)
  useEffect(load, [])
  if (!jobs) return null
  return (
    <div className="lightroom">
      <p>
        When you save with “Keep in sync”, Zen Sync keeps watching that folder. Photos added later are put in their
        place in the day and the numbered copies are renumbered, even while the window is closed (Zen Sync stays in the tray).
      </p>
      {jobs.length === 0 ? (
        <p className="hint">No jobs are being kept in sync yet.</p>
      ) : (
        <div className="list">
          {jobs.map((j) => (
            <div className="list-row job-row" key={j.dir}>
              <div className="job-text">
                <b>{j.name}</b>
                <span className="hint">{j.photos} photos, updated {when(j.savedAt)}</span>
              </div>
              <button className="ghost" aria-label={`Stop syncing ${j.name}`} onClick={() => void window.api.stopSyncing(j.dir).then(load)}>
                Stop syncing
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
