import { useState } from 'react'

type Mode = 'offer' | 'buying' | 'key'

export function UnlockPanel({ reason, onUnlocked, onClose }: { reason?: string; onUnlocked: () => void; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('offer')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [owner, setOwner] = useState<string | null>(null)

  async function buy() {
    setError(null)
    setMode('buying')
    const r = await window.api.buy()
    if (r.ok) return setOwner(r.customerName)
    setMode('offer')
    if (!('cancelled' in r)) setError(r.message)
  }

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
      {mode === 'buying' ? (
        <p>Complete your purchase in the checkout window…</p>
      ) : (
        <>
          <p>One payment of £14.99, no subscription. Save weddings of any size, and save a folder for each part of the day. Use it on two computers.</p>
          {mode === 'offer' ? (
            <>
              <button className="primary" onClick={buy}>Buy for £14.99</button>
              <button className="ghost" onClick={() => { setError(null); setMode('key') }}>I already bought it</button>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" aria-label="Licence key" placeholder="ZS-XXXX-XXXX-XXXX-XXXX" value={key} onChange={(e) => setKey(e.target.value)} />
              <button onClick={activate} disabled={busy}>{busy ? 'Checking…' : 'Activate'}</button>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <p className="hint">Payments are handled securely by Stripe. Unlocking needs the internet once; after that Zen Sync works offline.</p>
        </>
      )}
      <div className="actions">
        <button className="ghost" onClick={onClose}>Not now</button>
      </div>
    </div>
  )
}
