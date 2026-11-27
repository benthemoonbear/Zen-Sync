import { useEffect, useState } from 'react'

type EventRow = { id: string; name: string; custom?: boolean }

/** Options for an event-type select: built-in types, then your own. */
export function EventOptions({ events }: { events: EventRow[] }) {
  const own = events.filter((e) => e.custom)
  return (
    <>
      {events.filter((e) => !e.custom).map((e) => (
        <option key={e.id} value={e.id}>{e.name}</option>
      ))}
      {own.length > 0 && (
        <optgroup label="Your event types">
          {own.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </optgroup>
      )}
    </>
  )
}

/** Start screen "Type of event": Automatic (detect from the photos) or a type. Saved straight away. */
export function EventPicker({ onChanged }: { onChanged?: (id: string) => void }) {
  const [events, setEvents] = useState<EventRow[]>([])
  const [current, setCurrent] = useState('')

  useEffect(() => {
    void window.api.getEvents().then((r) => {
      setEvents(r.events)
      setCurrent(r.current)
    })
  }, [])

  async function change(id: string) {
    setCurrent(id)
    await window.api.setEvent(id)
    onChanged?.(id)
  }

  return (
    <label className="event-picker">
      <span>Type of event</span>
      <select aria-label="Type of event" value={current} onChange={(e) => void change(e.target.value)}>
        <option value="auto">Automatic (detect from the photos)</option>
        <EventOptions events={events} />
      </select>
    </label>
  )
}
