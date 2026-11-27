import { useEffect, useState, type ReactElement } from 'react'
import { LightroomPanel } from './LightroomPanel'

const EDITORS = [
  { id: 'lightroom', name: 'Lightroom Classic' },
  { id: 'captureone', name: 'Capture One' },
  { id: 'dxo', name: 'DxO PhotoLab' },
  { id: 'on1', name: 'ON1 Photo RAW' },
  { id: 'darktable', name: 'darktable' },
  { id: 'other', name: 'Any other app' }
] as const
type EditorId = (typeof EDITORS)[number]['id']

function CopyLocation() {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(await window.api.appLocation())
    setCopied(true)
  }
  return (
    <button className={copied ? '' : 'primary'} onClick={() => void copy()}>
      {copied ? 'Copied' : 'Copy Zen Sync’s location'}
    </button>
  )
}

function Steps({ steps }: { steps: { title: string; text: string; action?: ReactElement }[] }) {
  return (
    <ol className="steps">
      {steps.map((s) => (
        <li key={s.title}>
          <div>
            <b>{s.title}</b>
            <span>{s.text}</span>
          </div>
          {s.action}
        </li>
      ))}
    </ol>
  )
}

function Darktable() {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    void window.api.darktableSupported().then(setSupported)
  }, [])
  async function add() {
    const r = await window.api.addToDarktable()
    setMessage(r.ok ? { ok: true, text: 'Added. Restart darktable to see Zen Sync in the export module.' } : { ok: false, text: r.message })
  }
  if (supported === null) return null
  if (!supported) {
    return (
      <p>
        Open darktable once on this computer, then come back here. (If you installed Zen Sync as a Flatpak, use the
        AppImage for darktable, or use “Any other app” to watch your export folder.)
      </p>
    )
  }
  return (
    <>
      <Steps
        steps={[
          {
            title: 'Add Zen Sync to darktable',
            text: 'Adds Zen Sync as a place to export to.',
            action: <button className="primary" onClick={() => void add()}>Add Zen Sync to darktable</button>
          },
          {
            title: 'Export to Zen Sync',
            text: 'In the export module, set target storage to Zen Sync and the file format to JPEG. Each export is saved in Pictures › Zen Sync (change it in preferences › lua options) and opens in Zen Sync.'
          }
        ]}
      />
      {message && <p className={message.ok ? 'hint' : 'error'} role="status">{message.text}</p>}
    </>
  )
}

function WatchFolder() {
  const [folder, setFolder] = useState<string | null>(null)
  useEffect(() => {
    void window.api.getWatchFolder().then(setFolder)
  }, [])
  return (
    <>
      <p>Works with any editor, including Lightroom (not Classic) and Photo Mechanic: export each job into its own folder inside a folder Zen Sync watches, and it sorts each export as soon as it finishes.</p>
      <div className="watch">
        {folder ? (
          <>
            <span className="watch-path">{folder}</span>
            <button className="ghost" onClick={() => void window.api.clearWatchFolder().then(() => setFolder(null))}>Stop watching</button>
          </>
        ) : (
          <span className="hint" style={{ flex: 1 }}>Not watching a folder.</span>
        )}
        <button className={folder ? '' : 'primary'} onClick={() => void window.api.chooseWatchFolder().then(setFolder)}>
          {folder ? 'Change folder' : 'Choose a folder to watch'}
        </button>
      </div>
      <p className="hint">Zen Sync needs to be open (it can be minimised) to notice new exports.</p>
    </>
  )
}

/** Settings › Editors: send finished exports straight from your editor into Zen Sync. */
export function EditorsPanel() {
  const [editor, setEditor] = useState<EditorId>('lightroom')
  return (
    <div className="lightroom">
      <div className="editor-pick" role="radiogroup" aria-label="Your editor">
        {EDITORS.map((e) => (
          <button key={e.id} role="radio" aria-checked={editor === e.id} className={editor === e.id ? 'on' : ''} onClick={() => setEditor(e.id)}>
            {e.name}
          </button>
        ))}
      </div>
      {editor === 'lightroom' && <LightroomPanel />}
      {editor === 'captureone' && (
        <Steps
          steps={[
            { title: 'Copy Zen Sync’s location', text: 'You’ll paste it into Capture One.', action: <CopyLocation /> },
            { title: 'Make a Zen Sync recipe', text: 'In Capture One’s export settings, make a JPEG recipe called Zen Sync and set Open With to Zen Sync (choose Other… and paste the location).' },
            { title: 'Export with it', text: 'Capture One hands photos over one at a time; Zen Sync waits until the export has finished, then sorts them all.' }
          ]}
        />
      )}
      {editor === 'dxo' && (
        <Steps
          steps={[
            { title: 'Copy Zen Sync’s location', text: 'You’ll paste it into PhotoLab.', action: <CopyLocation /> },
            { title: 'Use Export to Application', text: 'In PhotoLab’s export window choose Export to Application, pick JPEG, and select Zen Sync as the application (Select software, then paste the location).' },
            { title: 'Only those photos are sorted', text: 'PhotoLab saves these exports next to your originals; Zen Sync sorts just the photos it was sent and saves the numbered copies in a “numbered” folder there.' }
          ]}
        />
      )}
      {editor === 'on1' && (
        <Steps
          steps={[
            { title: 'Copy Zen Sync’s location', text: 'You’ll paste it into ON1.', action: <CopyLocation /> },
            { title: 'Open In Zen Sync after export', text: 'In ON1’s Export window, under Destination › After Export, turn on Open In and choose Send to Other Application, then Zen Sync.' },
            { title: 'Save it as a preset', text: 'Save the export settings as a preset called Zen Sync to export in one click next time.' }
          ]}
        />
      )}
      {editor === 'darktable' && <Darktable />}
      {editor === 'other' && <WatchFolder />}
    </div>
  )
}
