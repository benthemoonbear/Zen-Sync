import { useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { ClockBanner } from '../components/ClockBanner'
import { Preview } from '../components/Preview'
import { Strip } from '../components/Strip'
import { Timeline } from '../components/Timeline'
import { folderName } from '../format'
import { appStore, useApp } from '../state/store'
import { useKeyboard } from '../useKeyboard'

function NewPartPrompt({ onDone }: { onDone: (name: string | null) => void }) {
  const [name, setName] = useState('')
  return (
    <div className="overlay">
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onDone(name.trim())
        }}
      >
        <h2>New part of the day</h2>
        <input type="text" autoFocus placeholder="First look" value={name} onChange={(e) => setName(e.target.value)} aria-label="Part name" />
        <div className="actions">
          <button type="button" className="ghost" onClick={() => onDone(null)}>Cancel</button>
          <button type="submit" className="primary">Add part</button>
        </div>
      </form>
    </div>
  )
}

export function ReviewScreen({ onSave, onSettings, dialogOpen = false }: { onSave: () => void; onSettings: () => void; dialogOpen?: boolean }) {
  const dir = useApp((s) => s.dir)
  const photos = useApp((s) => s.photos)
  const result = useApp((s) => s.result)
  const [newPartAfter, setNewPartAfter] = useState<string | null | undefined>(undefined)
  const [showSkipped, setShowSkipped] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  useKeyboard(newPartAfter === undefined && !dialogOpen)

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return
    const s = appStore().getState()
    const a = String(active.id)
    const o = String(over.id)
    if (a.startsWith('photo:')) {
      const path = a.slice(6)
      const paths = s.selected.includes(path) ? s.selected : [path]
      if (!s.selected.includes(path)) s.select(path, false)
      if (o.startsWith('tile:')) {
        const target = s.photos.findIndex((p) => p.path === o.slice(5))
        const from = s.photos.findIndex((p) => p.path === path)
        s.movePhotos(paths, target > from ? target + 1 : target)
      } else if (o.startsWith('sec:')) s.sendToPart(o.slice(4))
      else if (o.startsWith('gap:')) setNewPartAfter(o.slice(4) || null)
    } else if (a.startsWith('section:')) {
      const partId = a.slice(8)
      if (o.startsWith('sec:')) s.moveSection(partId, s.partOrder.indexOf(o.slice(4)))
      else if (o.startsWith('gap:')) {
        const after = o.slice(4)
        const rest = s.partOrder.filter((id) => id !== partId)
        s.moveSection(partId, after ? rest.indexOf(after) + 1 : 0)
      }
    }
  }

  const skipped = result?.skipped ?? []
  return (
    <div className="app">
      <div className="header">
        <div className="title">
          {folderName(dir ?? '')} · {photos.length} photos · {result?.cameras.length ?? 0} cameras
        </div>
        {skipped.length > 0 && (
          <button className="ghost" onClick={() => setShowSkipped(!showSkipped)}>
            {skipped.length === 1 ? "1 file couldn't be read" : `${skipped.length} files couldn't be read`}
          </button>
        )}
        <button onClick={() => appStore().getState().goNextUnsure()}>Next unsure</button>
        <button className="ghost" onClick={onSettings}>Settings</button>
        <button className="ghost" onClick={() => appStore().getState().reset()}>Start over</button>
        <button className="primary" onClick={onSave}>Save copies</button>
      </div>
      {showSkipped && (
        <div className="banner">
          <span>{skipped.map((s) => `${s.name} — ${s.reason}`).join(' · ')}</span>
        </div>
      )}
      <ClockBanner />
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <Timeline />
        <div className="body">
          <Preview />
          <Strip />
        </div>
      </DndContext>
      {newPartAfter !== undefined && (
        <NewPartPrompt
          onDone={(name) => {
            if (name) appStore().getState().newPartWithSelection(newPartAfter, name)
            setNewPartAfter(undefined)
          }}
        />
      )}
    </div>
  )
}
