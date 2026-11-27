import { useEffect, useState } from 'react'
import { appStore, useApp } from '../state/store'
import { EventOptions } from './EventPicker'

/** In the review header: which event type the photos were sorted as (and whether Zen Sync detected it); change it to re-sort. */
export function EventChip() {
  const event = useApp((s) => s.result?.event)
  const [events, setEvents] = useState<{ id: string; name: string; custom?: boolean }[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void window.api.getEvents().then((r) => setEvents(r.events))
  }, [])
  if (!event) return null

  async function change(id: string) {
    setBusy(true)
    try {
      const result = await window.api.resortAs(id)
      const s = appStore().getState()
      s.load(s.dir!, result)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="event-chip">
      <select aria-label="Sorted as" value={event.id} disabled={busy} onChange={(e) => void change(e.target.value)}>
        <EventOptions events={events.some((e) => e.id === event.id) ? events : [...events, { id: event.id, name: event.name }]} />
      </select>
      {event.detected && <span className="detected" title="Zen Sync worked out the type of event from the photos">Detected</span>}
    </span>
  )
}
