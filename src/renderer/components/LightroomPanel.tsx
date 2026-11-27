import { useEffect, useState } from 'react'

/** Settings › Lightroom: one click to put Zen Sync in Lightroom Classic's After Export menu, then how to use it. */
export function LightroomPanel() {
  const [status, setStatus] = useState<{ supported: boolean; installed: boolean } | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    void window.api.lightroomStatus().then(setStatus)
  }, [])

  async function add() {
    const r = await window.api.addToLightroom()
    if (r.ok) {
      setMessage({ ok: true, text: 'Added. Restart Lightroom Classic if it was already open.' })
      setStatus({ supported: true, installed: true })
    } else setMessage({ ok: false, text: r.message })
  }

  if (!status) return null
  if (!status.supported) {
    return (
      <div className="lightroom">
        <p>
          Lightroom Classic runs on Windows and Mac. On those computers Zen Sync can sort photos the moment Lightroom
          finishes exporting them. Here, use “Any other app” to watch your export folder, or drop the folder onto Zen Sync.
        </p>
      </div>
    )
  }
  return (
    <div className="lightroom">
      <p>Export from Lightroom Classic and Zen Sync opens and sorts the photos as soon as the export finishes.</p>
      <ol className="steps">
        <li>
          <div>
            <b>Add Zen Sync to Lightroom</b>
            <span>Puts Zen Sync in the After Export menu of Lightroom's Export window.</span>
          </div>
          <button className={status.installed ? '' : 'primary'} onClick={() => void add()}>
            {status.installed ? 'Add again' : 'Add Zen Sync to Lightroom'}
          </button>
        </li>
        <li>
          <div>
            <b>Choose it when you export</b>
            <span>In the Export window, under Post-Processing, set After Export to Zen Sync. Export each job to its own empty folder.</span>
          </div>
        </li>
        <li>
          <div>
            <b>Save it as a preset</b>
            <span>Click Add under the presets list and name it Zen Sync. Next time it's File › Export with Preset › Zen Sync.</span>
          </div>
        </li>
      </ol>
      {status.installed && !message && <p className="hint">Zen Sync is in Lightroom's After Export menu.</p>}
      {message && <p className={message.ok ? 'hint' : 'error'} role="status">{message.text}</p>}
    </div>
  )
}
