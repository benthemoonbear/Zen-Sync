import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { SortedPhoto } from '../../main/core/types'
import { thumbUrl, THUMB_SMALL } from '../../shared/api'
import { partColour } from '../format'
import { appStore, useApp } from '../state/store'
import { boxFrom, pathsInBox, type Box } from '../marquee'

function Tile({ photo, n, colour, cam, selected }: { photo: SortedPhoto; n: number; colour: string; cam: string; selected: boolean }) {
  const drag = useDraggable({ id: `photo:${photo.path}` })
  const drop = useDroppable({ id: `tile:${photo.path}` })
  const ref = useRef<HTMLDivElement | null>(null)
  const current = useApp((s) => s.current === photo.path)
  useEffect(() => {
    if (current) ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [current])
  const onClick = (e: MouseEvent) => {
    const s = appStore().getState()
    if (e.shiftKey) s.selectRange(photo.path)
    else s.select(photo.path, e.metaKey || e.ctrlKey)
  }
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
      data-path={photo.path}
      className={`tile${photo.unsure ? ' unsure' : ''}${selected ? ' selected' : ''}${drag.isDragging ? ' dragging' : ''}${drop.isOver ? ' drop-before' : ''}`}
      style={{ ['--part' as string]: colour }}
      onClick={onClick}
      title={photo.name}
    >
      <img src={thumbUrl(photo.path, THUMB_SMALL)} alt="" loading="lazy" draggable={false} />
      <span className="n">{n}</span>
      {photo.unsure && <span className="q" title="Not sure about this one">?</span>}
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
  const stripRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState<Box | null>(null)

  /** Box-select: drag across empty space in the panel to lasso photos. Shift/Ctrl adds to the selection. */
  function onPointerDown(e: ReactPointerEvent) {
    const strip = stripRef.current
    if (e.button !== 0 || !strip || (e.target as HTMLElement).closest('.tile, button')) return
    const start = { x: e.clientX, y: e.clientY + strip.scrollTop }
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    const base = additive ? appStore().getState().selected : []
    let active = false
    const move = (ev: PointerEvent) => {
      const r = strip.getBoundingClientRect()
      if (ev.clientY < r.top + 40) strip.scrollTop -= 14
      else if (ev.clientY > r.bottom - 40) strip.scrollTop += 14
      const now = { x: ev.clientX, y: ev.clientY + strip.scrollTop }
      if (!active && Math.hypot(now.x - start.x, now.y - start.y) < 5) return
      active = true
      const b = boxFrom(start, now)
      setBox({ left: b.left - r.left, right: b.right - r.left, top: b.top - r.top, bottom: b.bottom - r.top })
      const tiles = [...strip.querySelectorAll<HTMLElement>('.tile[data-path]')].map((el) => {
        const t = el.getBoundingClientRect()
        return { path: el.dataset.path!, rect: { left: t.left, right: t.right, top: t.top + strip.scrollTop, bottom: t.bottom + strip.scrollTop } }
      })
      const hit = pathsInBox(b, tiles)
      appStore().getState().selectPaths([...base, ...hit.filter((p) => !base.includes(p))], false)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setBox(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="strip" ref={stripRef} onPointerDown={onPointerDown}>
      {box && (
        <div
          className="marquee"
          style={{ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top }}
          aria-hidden="true"
        />
      )}
      {partOrder.map((partId) => {
        const inPart = photos.filter((p) => p.partId === partId)
        if (!inPart.length) return null
        const index = parts.findIndex((p) => p.id === partId)
        const colour = partColour(index, parts.length)
        return (
          <div className="strip-section" key={partId} id={`section-${partId}`}>
            <div className="strip-heading">
              <i style={{ background: colour }} />
              {parts[index]?.name ?? partId}
              <span className="count">{inPart.length}</span>
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
