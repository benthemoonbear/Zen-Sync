import { thumbUrl, THUMB_LARGE } from '../../shared/api'
import { timeOfDay } from '../format'
import { useApp } from '../state/store'

export function Preview() {
  const photos = useApp((s) => s.photos)
  const current = useApp((s) => s.current)
  const parts = useApp((s) => s.parts)
  const cameras = useApp((s) => s.result?.cameras ?? [])
  const index = photos.findIndex((p) => p.path === current)
  const photo = photos[index]
  if (!photo) return <div className="preview" />
  const meta = [
    parts.find((p) => p.id === photo.partId)?.name ?? photo.partId,
    cameras.find((c) => c.id === photo.cameraId)?.label ?? photo.cameraId,
    timeOfDay(photo.correctedMs)
  ].filter(Boolean)
  return (
    <div className="preview">
      <div className="img">
        <img src={thumbUrl(photo.path, THUMB_LARGE)} alt={photo.name} />
      </div>
      <div className="meta">
        <span className="num" data-testid="preview-number">{index + 1}</span>
        <span className="meta-text" data-testid="preview-meta">{meta.join(' · ')}</span>
        {photo.unsure && <span style={{ color: 'var(--amber)', fontSize: 12 }}>Not sure about this one</span>}
      </div>
    </div>
  )
}
