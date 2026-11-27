import { useState, type KeyboardEvent } from 'react'
import { ACTIONS, DEFAULT_SHORTCUTS, assign, comboFromEvent, formatCombo, type ActionId, type ShortcutMap } from '../shortcuts'

const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

/** Lists every action with its key; click one, then press the new key (Esc cancels, Backspace clears). */
export function ShortcutsPanel({ map, onChange }: { map: ShortcutMap; onChange: (map: ShortcutMap) => void }) {
  const [recording, setRecording] = useState<ActionId | null>(null)
  const [note, setNote] = useState<string | null>(null)

  function onKeyDown(action: ActionId, e: KeyboardEvent) {
    if (recording !== action) return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') return setRecording(null)
    if (e.key === 'Backspace' || e.key === 'Delete') {
      onChange({ ...map, [action]: '' })
      setRecording(null)
      return
    }
    const combo = comboFromEvent(e.nativeEvent)
    if (!combo) return
    const previous = ACTIONS.find((a) => a.id !== action && map[a.id] === combo)
    setNote(previous ? `${formatCombo(combo, mac)} was used by "${previous.label}", which now has no shortcut.` : null)
    onChange(assign(map, action, combo))
    setRecording(null)
  }

  return (
    <div className="shortcuts">
      <p>Click a shortcut, then press the keys you want. Esc cancels, Backspace removes it.</p>
      <div className="list">
        {ACTIONS.map((a) => (
          <div className="list-row shortcut-row" key={a.id}>
            <span className="shortcut-label">{a.label}</span>
            <button
              className={`kbd${recording === a.id ? ' recording' : ''}${map[a.id] ? '' : ' none'}`}
              aria-label={`Change shortcut for ${a.label}`}
              onClick={() => setRecording(recording === a.id ? null : a.id)}
              onKeyDown={(e) => onKeyDown(a.id, e)}
              onBlur={() => recording === a.id && setRecording(null)}
            >
              {recording === a.id ? 'Press a key…' : formatCombo(map[a.id], mac)}
            </button>
          </div>
        ))}
      </div>
      {note && <p className="hint" role="status">{note}</p>}
      <div>
        <button className="ghost" onClick={() => { onChange(DEFAULT_SHORTCUTS); setNote(null) }}>Reset shortcuts</button>
      </div>
    </div>
  )
}
