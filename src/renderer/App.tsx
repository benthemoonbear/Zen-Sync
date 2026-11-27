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
  const [arrived, setArrived] = useState<string | null>(null)

  // Photos exported from Lightroom (After Export: Zen Sync) open here.
  useEffect(() => {
    const open = (dir: string) => {
      const s = appStore().getState()
      if (s.result && s.edited) setArrived(dir)
      else {
        setDialog(null)
        s.openFolder(dir)
      }
    }
    const off = window.api.onOpenFolder(open)
    void window.api.takeLaunchFolder().then((dir) => dir && open(dir))
    return off
  }, [])

  const arrivedPrompt = arrived && (
    <div className="overlay">
      <div className="dialog" role="alertdialog" aria-labelledby="arrived-title">
        <h2 id="arrived-title">Lightroom sent photos from “{folderName(arrived)}”</h2>
        <p>Open them now? The changes you've made to “{folderName(appStore().getState().dir ?? '')}” haven't been saved.</p>
        <div className="actions">
          <button className="ghost" onClick={() => setArrived(null)}>Keep working</button>
          <button className="primary" onClick={() => { setDialog(null); appStore().getState().openFolder(arrived); setArrived(null) }}>Open new photos</button>
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
