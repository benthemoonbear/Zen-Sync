import { useState } from 'react'
import { DropScreen } from './screens/DropScreen'
import { ReviewScreen } from './screens/ReviewScreen'
import { useApp } from './state/store'
import './theme.css'

export function App() {
  const result = useApp((s) => s.result)
  const [, setDialog] = useState<'save' | 'settings' | null>(null)
  if (!result) return <DropScreen />
  return <ReviewScreen onSave={() => setDialog('save')} onSettings={() => setDialog('settings')} />
}
