import { useEffect, useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Part } from '../../main/core/types'
import { UnlockPanel } from './UnlockDialog'
import { partColour } from '../format'
import { EventOptions } from './EventPicker'
import { ShortcutsPanel } from './ShortcutsPanel'
import { EditorsPanel } from './EditorsPanel'
import { SyncedJobsPanel } from './SyncedJobsPanel'
import { useShortcuts } from '../state/shortcuts'
import type { ShortcutMap } from '../shortcuts'

function Row({ part, i, total, onChange, onGroup, onMove, onRemove }: {
  part: Part; i: number; total: number
  onChange: (name: string) => void; onGroup: (group: string) => void; onMove: (d: number) => void; onRemove: () => void
}) {
  const s = useSortable({ id: part.id })
  return (
    <div ref={s.setNodeRef} className="list-row" style={{ transform: CSS.Transform.toString(s.transform), transition: s.transition }}>
      <span className="grip" {...s.listeners} {...s.attributes} aria-label={`Drag ${part.name}`}>⋮⋮</span>
      <span className="swatch" style={{ background: partColour(i, total) }} aria-hidden="true" />
      <input type="text" aria-label={`Part ${i + 1} name`} value={part.name} onChange={(e) => onChange(e.target.value)} />
      <input type="text" className="group-input" aria-label={`Folder for ${part.name || `part ${i + 1}`}`} placeholder="Folder (optional)"
        value={part.group ?? ''} onChange={(e) => onGroup(e.target.value)} />
      <button className="ghost" aria-label={`Move ${part.name} up`} disabled={i === 0} onClick={() => onMove(-1)}>↑</button>
      <button className="ghost" aria-label={`Move ${part.name} down`} disabled={i === total - 1} onClick={() => onMove(1)}>↓</button>
      <button className="ghost" aria-label={`Remove ${part.name}`} onClick={onRemove}>✕</button>
    </div>
  )
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [parts, setParts] = useState<Part[]>([])
  const [licence, setLicence] = useState<{ licensed: boolean; customerName?: string; key?: string } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  const [tab, setTab] = useState<'parts' | 'shortcuts' | 'editors' | 'sync'>('parts')
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(useShortcuts.getState().map)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // The event type whose parts are being edited (Settings never edits "Automatic").
  const [events, setEvents] = useState<{ id: string; name: string; custom?: boolean }[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const [naming, setNaming] = useState<null | { mode: 'new' | 'rename'; value: string }>(null)
  const loadEvents = () =>
    window.api.getEvents().then((r) => {
      setEvents(r.events)
      return r
    })
  const loadParts = (id = editId) => id && void window.api.getParts(id).then(setParts)
  useEffect(() => {
    void loadEvents().then((r) => {
      const id = r.current === 'auto' || !r.events.some((e) => e.id === r.current) ? 'wedding' : r.current
      setEditId(id)
      loadParts(id)
    })
    void window.api.licence().then(setLicence)
    void useShortcuts.getState().load().then(() => setShortcuts(useShortcuts.getState().map))
  }, [])

  const editingCustom = events.find((e) => e.id === editId && e.custom)

  async function finishNaming() {
    if (!naming || !naming.value.trim()) return setNaming(null)
    if (naming.mode === 'new') {
      const id = await window.api.createEvent(naming.value.trim())
      await loadEvents()
      setEditId(id)
      loadParts(id)
    } else if (editId) {
      await window.api.renameEvent(editId, naming.value.trim())
      await loadEvents()
    }
    setNaming(null)
  }

  async function removeEvent() {
    if (!editingCustom) return
    await window.api.deleteEvent(editingCustom.id)
    await loadEvents()
    setEditId('wedding')
    loadParts('wedding')
  }

  async function reset() {
    await window.api.setParts([], editId!)
    loadParts()
  }

  const update = (i: number, patch: Partial<Part>) => setParts(parts.map((p, k) => (k === i ? { ...p, ...patch } : p)))
  const move = (i: number, d: number) => setParts(arrayMove(parts, i, i + d))
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    setParts(arrayMove(parts, parts.findIndex((p) => p.id === active.id), parts.findIndex((p) => p.id === over.id)))
  }

  async function save() {
    const cleaned = parts.map((p) => {
      const group = p.group?.trim()
      return { ...p, name: p.name.trim() || 'Untitled', group: group || undefined }
    })
    await window.api.setParts(cleaned, editId!)
    await useShortcuts.getState().save(shortcuts)
    onClose()
  }

  async function deactivate() {
    const r = await window.api.deactivate()
    if (r.ok) setLicence({ licensed: false })
    else setMessage(r.message ?? "Couldn't deactivate this computer.")
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {unlocking ? (
        <UnlockPanel
          onClose={() => setUnlocking(false)}
          onUnlocked={() => {
            setUnlocking(false)
            void window.api.licence().then(setLicence)
          }}
        />
      ) : (
      <div className="dialog" style={{ width: 'min(700px, 94vw)' }}>
        <h2>Settings</h2>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'parts'} className={tab === 'parts' ? 'on' : ''} onClick={() => setTab('parts')}>Parts of the day</button>
          <button role="tab" aria-selected={tab === 'shortcuts'} className={tab === 'shortcuts' ? 'on' : ''} onClick={() => setTab('shortcuts')}>Shortcuts</button>
          <button role="tab" aria-selected={tab === 'editors'} className={tab === 'editors' ? 'on' : ''} onClick={() => setTab('editors')}>Editors</button>
          <button role="tab" aria-selected={tab === 'sync'} className={tab === 'sync' ? 'on' : ''} onClick={() => setTab('sync')}>Synced jobs</button>
        </div>
        {tab === 'sync' ? <SyncedJobsPanel /> : tab === 'editors' ? <EditorsPanel /> : tab === 'shortcuts' ? <ShortcutsPanel map={shortcuts} onChange={setShortcuts} /> : <>
        <div className="event-bar">
          {naming ? (
            <>
              <input
                type="text"
                autoFocus
                aria-label={naming.mode === 'new' ? 'Name of the new event type' : 'New name for this event type'}
                placeholder="e.g. Bar mitzvah, Product launch"
                value={naming.value}
                onChange={(e) => setNaming({ ...naming, value: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && void finishNaming()}
              />
              <button className="primary" onClick={() => void finishNaming()}>{naming.mode === 'new' ? 'Create' : 'Rename'}</button>
              <button className="ghost" onClick={() => setNaming(null)}>Cancel</button>
            </>
          ) : (
            <>
              <label className="event-picker">
                <span>Event type</span>
                <select aria-label="Event type to edit" value={editId ?? ''} onChange={(e) => { setEditId(e.target.value); loadParts(e.target.value) }}>
                  <EventOptions events={events} />
                </select>
              </label>
              {editingCustom && (
                <>
                  <button className="ghost" onClick={() => setNaming({ mode: 'rename', value: editingCustom.name })}>Rename</button>
                  <button className="ghost" aria-label="Delete event type" onClick={() => void removeEvent()}>Delete</button>
                </>
              )}
              <span style={{ flex: 1 }} />
              <button onClick={() => setNaming({ mode: 'new', value: '' })}>New event type</button>
            </>
          )}
        </div>
        <p>Parts of the day, in order. Drag to reorder. Give parts the same folder to save them as sub-folders inside it. Changes apply the next time you sort a folder.</p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={parts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="list">
              {parts.map((p, i) => (
                <Row key={p.id} part={p} i={i} total={parts.length}
                  onChange={(name) => update(i, { name })}
                  onGroup={(group) => update(i, { group })}
                  onMove={(d) => move(i, d)}
                  onRemove={() => setParts(parts.filter((_, k) => k !== i))} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setParts([...parts, { id: `custom-${Date.now().toString(36)}`, name: '', prompts: [] }])}>Add a part</button>
          <button className="ghost" onClick={() => void reset()}>Reset to defaults</button>
        </div>
        </>}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          {licence?.licensed ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1 }}>Licensed to {licence.customerName}</span>
                <button onClick={deactivate}>Deactivate this computer</button>
              </div>
              {licence.key && (
                <span className="hint">
                  Key for your second computer: <code style={{ userSelect: 'all', color: 'var(--accent)' }}>{licence.key}</code>
                </span>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="hint" style={{ flex: 1 }}>Free version: saves up to 250 photos in one folder</span>
              <button onClick={() => setUnlocking(true)}>Unlock</button>
            </div>
          )}
          {message && <p className="error">{message}</p>}
        </div>
        <div className="actions">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save}>Save settings</button>
        </div>
      </div>
      )}
    </div>
  )
}
