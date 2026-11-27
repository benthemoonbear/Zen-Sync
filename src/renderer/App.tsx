import { useEffect, useState } from 'react'
import { SaveDialog } from './components/SaveDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { DropScreen } from './screens/DropScreen'
import { ReviewScreen } from './screens/ReviewScreen'
import { appStore, useApp } from './state/store'
import { folderName } from './format'
import './theme.css'

export function App() {
  const result = useApp((s) => s.result)
  const [dialog, setDialog] = useState<'save' | 'settings' | null>(null)
  const [arrived, setArrived] = useState<{ dir: string; photos: string[] } | null>(null)

  // Photos exported from Lightroom (After Export: Zen Sync) open here.
  useEffect(() => {
    const open = (sent: { dir: string; photos: string[] }) => {
      const s = appStore().getState()
      if (s.result && s.edited) setArrived(sent)
      else {
        setDialog(null)
        s.openFolder(sent.dir, sent.photos)
      }
    }
    const off = window.api.onOpenFolder(open)
    void window.api.takeLaunchFolder().then((sent) => sent && open(sent))
    return off
  }, [])

  const arrivedPrompt = arrived && (
    <div className="overlay">
      <div className="dialog" role="alertdialog" aria-labelledby="arrived-title">
        <h2 id="arrived-title">New photos from “{folderName(arrived.dir)}”</h2>
        <p>Open them now? The changes you've made to “{folderName(appStore().getState().dir ?? '')}” haven't been saved.</p>
        <div className="actions">
          <button className="ghost" onClick={() => setArrived(null)}>Keep working</button>
          <button className="primary" onClick={() => { setDialog(null); appStore().getState().openFolder(arrived.dir, arrived.photos); setArrived(null) }}>Open new photos</button>
        </div>
      </div>
    </div>
  )

  if (!result) return <>{<DropScreen />}{arrivedPrompt}</>
  return (
    <>
      {arrivedPrompt}
      <ReviewScreen onSave={() => setDialog('save')} onSettings={() => setDialog('settings')} dialogOpen={dialog !== null} />
      {dialog === 'save' && <SaveDialog onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
    </>
  )
}
