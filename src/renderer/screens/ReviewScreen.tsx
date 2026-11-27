import { useMemo, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { ClockBanner } from '../components/ClockBanner'
import { EnsoLogo } from '../components/Enso'
import { Preview } from '../components/Preview'
import { Strip } from '../components/Strip'
import { Timeline } from '../components/Timeline'
import { folderName } from '../format'
import { thumbUrl, THUMB_SMALL } from '../../shared/api'
import { appStore, useApp } from '../state/store'
import { useKeyboard } from '../useKeyboard'

/** The selected photo, hugely blurred, glowing behind the whole screen. Fades in when the selection changes. */
function Ambient() {
  const current = useApp((s) => s.current)
  if (!current) return null
  return (
    <div className="ambient" aria-hidden="true">
      <div key={current} data-testid="ambient" className="ambient-img" style={{ backgroundImage: `url("${thumbUrl(current, THUMB_SMALL)}")` }} />
    </div>
  )
}

/** What follows the pointer while dragging: the photo, stacked if several are selected, with a count. */
function DragStack({ path }: { path: string }) {
  const selected = useApp((s) => s.selected)
  const count = selected.includes(path) ? selected.length : 1
  const src = thumbUrl(path, THUMB_SMALL)
  return (
    <div className={`drag-stack${count > 1 ? ' many' : ''}`}>
      {count > 2 && <img className="under2" src={src} alt="" />}
      {count > 1 && <img className="under" src={src} alt="" />}
      <img src={src} alt="" />
      {count > 1 && <span className="drag-count">{count}</span>}
    </div>
  )
}

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
  const keyHandlers = useMemo(() => ({ onSave, onSettings }), [onSave, onSettings])
  useKeyboard(newPartAfter === undefined && !dialogOpen, keyHandlers)
  const selectedCount = useApp((s) => s.selected.length)

  const [dragging, setDragging] = useState<string | null>(null)
  function onDragStart({ active }: DragStartEvent) {
    const id = String(active.id)
    setDragging(id.startsWith('photo:') ? id.slice(6) : null)
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null)
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
  const unsureCount = photos.filter((p) => p.unsure).length
  const cameraCount = result?.cameras.length ?? 0
  return (
    <div className="app review">
      <Ambient />
      <div className="header">
        <span className="brand"><EnsoLogo size={24} small /></span>
        <div className="title">
          <h1 style={{ margin: 0, font: 'inherit' }}><strong>{folderName(dir ?? '')}</strong></h1>
          <span className="stats">
            {photos.length} photos, {cameraCount} {cameraCount === 1 ? 'camera' : 'cameras'}
          </span>
        </div>
        {selectedCount > 1 && (
          <span className="sel-count" data-testid="selection-count">{selectedCount} selected</span>
        )}
        {skipped.length > 0 && (
          <button className="ghost" onClick={() => setShowSkipped(!showSkipped)}>
            {skipped.length === 1 ? "1 file couldn't be read" : `${skipped.length} files couldn't be read`}
          </button>
        )}
        {unsureCount > 0 && (
          <button onClick={() => appStore().getState().goNextUnsure()} aria-label={`Next unsure, ${unsureCount} left`}>
            Next unsure<span className="badge">{unsureCount}</span>
          </button>
        )}
        <button className="ghost" onClick={onSettings}>Settings</button>
        <button className="ghost" onClick={() => appStore().getState().reset()}>Start over</button>
        <span className="divider" />
        <button className="primary" onClick={onSave}>Save copies</button>
      </div>
      {showSkipped && (
        <div className="banner notice">
          <span>{skipped.map((s) => `${s.name} — ${s.reason}`).join(' · ')}</span>
        </div>
      )}
      <ClockBanner />
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <Timeline />
        <div className="body">
          <Preview />
          <Strip />
        </div>
        <DragOverlay dropAnimation={null}>{dragging ? <DragStack path={dragging} /> : null}</DragOverlay>
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
