import { useEffect, useRef, type MouseEvent } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { SortedPhoto } from '../../main/core/types'
import { thumbUrl, THUMB_SMALL } from '../../shared/api'
import { partColour } from '../format'
import { appStore, useApp } from '../state/store'

function Tile({ photo, n, colour, cam, selected }: { photo: SortedPhoto; n: number; colour: string; cam: string; selected: boolean }) {
  const drag = useDraggable({ id: `photo:${photo.path}` })
  const drop = useDroppable({ id: `tile:${photo.path}` })
  const ref = useRef<HTMLDivElement | null>(null)
  const current = useApp((s) => s.current === photo.path)
  useEffect(() => {
    if (current) ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [current])
  const onClick = (e: MouseEvent) => appStore().getState().select(photo.path, e.shiftKey || e.metaKey || e.ctrlKey)
  return (
    <div
      ref={(el) => {
        ref.current = el
        drag.setNodeRef(el)
        drop.setNodeRef(el)
      }}
      {...drag.listeners}
      {...drag.attributes}
      data-testid="tile"
      className={`tile${photo.unsure ? ' unsure' : ''}${selected ? ' selected' : ''}${drag.isDragging ? ' dragging' : ''}`}
      style={{ borderBottomColor: colour, boxShadow: drop.isOver ? 'inset 3px 0 0 var(--text)' : undefined }}
      onClick={onClick}
      title={photo.name}
    >
      <img src={thumbUrl(photo.path, THUMB_SMALL)} alt="" loading="lazy" draggable={false} />
      <span className="n">{photo.unsure ? `${n}?` : n}</span>
      <span className="cam">{cam}</span>
    </div>
  )
}

export function Strip() {
  const photos = useApp((s) => s.photos)
  const partOrder = useApp((s) => s.partOrder)
  const parts = useApp((s) => s.parts)
  const selected = useApp((s) => s.selected)
  const cameras = useApp((s) => s.result?.cameras ?? [])
  const camLabel = new Map(cameras.map((c) => [c.id, c.label]))
  const numbers = new Map(photos.map((p, i) => [p.path, i + 1]))

  return (
    <div className="strip">
      {partOrder.map((partId) => {
        const inPart = photos.filter((p) => p.partId === partId)
        if (!inPart.length) return null
        const index = parts.findIndex((p) => p.id === partId)
        const colour = partColour(index)
        return (
          <div className="strip-section" key={partId} id={`section-${partId}`}>
            <div className="strip-heading">
              <i style={{ background: colour }} />
              {parts[index]?.name ?? partId} · {inPart.length}
            </div>
            <div className="tiles">
              {inPart.map((p) => (
                <Tile key={p.path} photo={p} n={numbers.get(p.path)!} colour={colour} cam={camLabel.get(p.cameraId) ?? ''} selected={selected.includes(p.path)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
