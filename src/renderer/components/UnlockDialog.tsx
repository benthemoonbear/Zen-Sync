import { useState } from 'react'

export function UnlockPanel({ reason, onUnlocked, onClose }: { reason?: string; onUnlocked: () => void; onClose: () => void }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [owner, setOwner] = useState<string | null>(null)

  async function activate() {
    if (!key.trim()) return setError('Paste your licence key first.')
    setBusy(true)
    setError(null)
    const r = await window.api.activate(key)
    setBusy(false)
    if (r.ok) setOwner(r.customerName)
    else setError(r.message)
  }

  if (owner) {
    return (
      <div className="dialog">
        <h2>Unlocked</h2>
        <p>Licensed to {owner}</p>
        <div className="actions">
          <button className="primary" onClick={onUnlocked}>Continue</button>
        </div>
      </div>
    )
  }

  return (
    <div className="dialog">
      <h2>Unlock the full version</h2>
      {reason && <p style={{ color: 'var(--amber-text)' }}>{reason}</p>}
      <p>One payment of £14.99, no subscription. Save weddings of any size, and save a folder for each part of the day.</p>
      <button className="primary" onClick={() => window.api.openBuyPage()}>Buy for £14.99</button>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="text" aria-label="Licence key" placeholder="Paste your licence key" value={key} onChange={(e) => setKey(e.target.value)} />
        <button onClick={activate} disabled={busy}>{busy ? 'Checking…' : 'Activate'}</button>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="hint">Activating needs the internet once. After that it works offline.</p>
      <div className="actions">
        <button className="ghost" onClick={onClose}>Not now</button>
      </div>
    </div>
  )
}
