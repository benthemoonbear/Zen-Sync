import { useEffect, useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Part } from '../../main/core/types'
import { UnlockPanel } from './UnlockDialog'

function Row({ part, i, total, onChange, onMove, onRemove }: {
  part: Part; i: number; total: number
  onChange: (name: string) => void; onMove: (d: number) => void; onRemove: () => void
}) {
  const s = useSortable({ id: part.id })
  return (
    <div ref={s.setNodeRef} className="list-row" style={{ transform: CSS.Transform.toString(s.transform), transition: s.transition }}>
      <span className="grip" {...s.listeners} {...s.attributes} aria-label={`Drag ${part.name}`}>⋮⋮</span>
      <input type="text" aria-label={`Part ${i + 1} name`} value={part.name} onChange={(e) => onChange(e.target.value)} />
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => {
    void window.api.getParts().then(setParts)
    void window.api.licence().then(setLicence)
  }, [])

  const update = (i: number, patch: Partial<Part>) => setParts(parts.map((p, k) => (k === i ? { ...p, ...patch } : p)))
  const move = (i: number, d: number) => setParts(arrayMove(parts, i, i + d))
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    setParts(arrayMove(parts, parts.findIndex((p) => p.id === active.id), parts.findIndex((p) => p.id === over.id)))
  }

  async function save() {
    const cleaned = parts.map((p) => ({ ...p, name: p.name.trim() || 'Untitled' }))
    await window.api.setParts(cleaned)
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
      <div className="dialog" style={{ width: 'min(560px, 92vw)' }}>
        <h2>Settings</h2>
        <p>Parts of the day, in order. Drag to reorder. Changes apply the next time you sort a folder.</p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={parts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="list">
              {parts.map((p, i) => (
                <Row key={p.id} part={p} i={i} total={parts.length}
                  onChange={(name) => update(i, { name })}
                  onMove={(d) => move(i, d)}
                  onRemove={() => setParts(parts.filter((_, k) => k !== i))} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <button onClick={() => setParts([...parts, { id: `custom-${Date.now().toString(36)}`, name: '', prompts: [] }])}>Add a part</button>
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
              <span className="hint" style={{ flex: 1 }}>Free version · saves up to 250 photos in one folder</span>
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
