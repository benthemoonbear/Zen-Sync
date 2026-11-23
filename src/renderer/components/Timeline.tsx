import { useDraggable, useDroppable } from '@dnd-kit/core'
import { sectionSizes } from '../state/order'
import { partColour, textOn, timeOfDay } from '../format'
import { useApp } from '../state/store'

function Gap({ after }: { after: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `gap:${after}` })
  return <div ref={setNodeRef} className={`tl-gap${isOver ? ' drop-target' : ''}`} title="Drop photos here to start a new part" />
}

function Section({ partId, count, name, colour, onJump }: { partId: string; count: number; name: string; colour: string; onJump: () => void }) {
  const drag = useDraggable({ id: `section:${partId}` })
  const drop = useDroppable({ id: `sec:${partId}` })
  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el)
        drop.setNodeRef(el)
      }}
      {...drag.listeners}
      {...drag.attributes}
      data-testid="timeline-section"
      data-part={partId}
      className={`tl-section${drop.isOver ? ' drop-target' : ''}`}
      style={{ flexGrow: count, flexBasis: 0, background: colour, color: textOn(colour), opacity: drag.isDragging ? 0.4 : 1 }}
      title={`${name}: ${count} photos`}
      onClick={onJump}
    >
      <span className="label">{name}</span>
      <span className="count">{count}</span>
    </div>
  )
}

export function Timeline() {
  const photos = useApp((s) => s.photos)
  const partOrder = useApp((s) => s.partOrder)
  const parts = useApp((s) => s.parts)
  const sizes = sectionSizes(photos, partOrder)
  const times = photos.map((p) => p.correctedMs).filter((t): t is number => t !== undefined)

  function jump(partId: string) {
    document.getElementById(`section-${partId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="timeline">
      <div className="timeline-bar">
        <Gap after="" />
        {sizes.map(({ partId, count }) => {
          const index = parts.findIndex((p) => p.id === partId)
          return (
            <div key={partId} style={{ display: 'contents' }}>
              <Section partId={partId} count={count} name={parts[index]?.name ?? partId} colour={partColour(index, parts.length)} onJump={() => jump(partId)} />
              <Gap after={partId} />
            </div>
          )
        })}
      </div>
      <div className="timeline-times">
        <span>{times.length ? timeOfDay(Math.min(...times)) : ''}</span>
        <span className="hint">Drag sections to reorder. Drop photos on a section to move them, or between sections to start a new part.</span>
        <span>{times.length ? timeOfDay(Math.max(...times)) : ''}</span>
      </div>
    </div>
  )
}
