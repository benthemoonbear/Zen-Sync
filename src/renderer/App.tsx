import { useState } from 'react'
import { SaveDialog } from './components/SaveDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { DropScreen } from './screens/DropScreen'
import { ReviewScreen } from './screens/ReviewScreen'
import { useApp } from './state/store'
import './theme.css'

export function App() {
  const result = useApp((s) => s.result)
  const [dialog, setDialog] = useState<'save' | 'settings' | null>(null)
  if (!result) return <DropScreen />
  return (
    <>
      <ReviewScreen onSave={() => setDialog('save')} onSettings={() => setDialog('settings')} dialogOpen={dialog !== null} />
      {dialog === 'save' && <SaveDialog onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
    </>
  )
}
