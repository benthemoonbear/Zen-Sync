import { useEffect, useState } from 'react'

/** "Type of event" dropdown. Saves the choice straight away; onChanged runs after it's saved. */
export function EventPicker({ onChanged }: { onChanged?: (id: string) => void }) {
  const [events, setEvents] = useState<{ id: string; name: string }[]>([])
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
        {events.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
    </label>
  )
}
