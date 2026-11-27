import { thumbUrl, THUMB_LARGE } from '../../shared/api'
import { partColour, timeOfDay } from '../format'
import { useApp } from '../state/store'

export function Preview() {
  const photos = useApp((s) => s.photos)
  const current = useApp((s) => s.current)
  const parts = useApp((s) => s.parts)
  const cameras = useApp((s) => s.result?.cameras ?? [])
  const index = photos.findIndex((p) => p.path === current)
  const photo = photos[index]
  if (!photo) return <div className="preview" />
  const partIndex = parts.findIndex((p) => p.id === photo.partId)
  const src = thumbUrl(photo.path, THUMB_LARGE)
  const partName = parts.find((p) => p.id === photo.partId)?.name ?? photo.partId
  const detail = [cameras.find((c) => c.id === photo.cameraId)?.label ?? photo.cameraId, timeOfDay(photo.correctedMs)].filter(Boolean)
  return (
    <div className="preview">
      <div className="img">
        <div className="backdrop" style={{ backgroundImage: `url("${src}")` }} aria-hidden="true" />
        <img src={src} alt={photo.name} />
      </div>
      <div className="meta">
        <span className="num" data-testid="preview-number">{index + 1}</span>
        <span className="meta-text">
          <b>
            <span className="dot" style={{ background: partColour(partIndex, parts.length) }} aria-hidden="true" />
            <span data-testid="preview-part">{partName}</span>
          </b>
          <span data-testid="preview-meta">{detail.join(', ')}</span>
        </span>
        {photo.unsure && <span className="chip">Not sure about this one</span>}
      </div>
    </div>
  )
}
