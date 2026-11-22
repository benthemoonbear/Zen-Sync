import type { SaveMode } from './types'

export const FREE_PHOTO_LIMIT = 250

export type SaveCheck = { ok: true } | { ok: false; reason: 'limit' | 'perPartLocked' }

/** Free version: sort and preview anything; save one folder of up to 250 photos. */
export function canSave(count: number, mode: SaveMode, licensed: boolean): SaveCheck {
  if (licensed) return { ok: true }
  if (mode === 'perPart') return { ok: false, reason: 'perPartLocked' }
  if (count > FREE_PHOTO_LIMIT) return { ok: false, reason: 'limit' }
  return { ok: true }
}

export interface LicenceState {
  key: string
  instanceId: string
  customerName: string
  activatedAt: string
}

export interface LicenceDeps {
  fetch: typeof fetch
  instanceName: string
  /** Base URL of the Zen Sync licence server (Cloudflare Worker), e.g. https://zen-sync-licences.<account>.workers.dev */
  serverUrl: string
}

type Result = { ok: true; state: LicenceState } | { ok: false; message: string }

const NETWORK_MESSAGE = "Couldn't reach the licence server. Check your internet connection and try again."
const NOT_SET_UP = "This copy of the app isn't set up for licences yet. Contact support."
const STILL_CONFIRMING = 'Your payment is still being confirmed. Check your email for your licence key, or try again in a minute.'

async function postJson(deps: LicenceDeps, path: string, body: unknown): Promise<Record<string, any>> {
  const res = await deps.fetch(`${deps.serverUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  })
  return (await res.json()) as Record<string, any>
}

/** Activates this computer once, online. After this the app never checks again. */
export async function activate(rawKey: string, deps: LicenceDeps): Promise<Result> {
  if (!deps.serverUrl) return { ok: false, message: NOT_SET_UP }
  const key = rawKey.trim()
  let r: Record<string, any>
  try {
    r = await postJson(deps, '/licences/activate', { key, instanceName: deps.instanceName })
  } catch {
    return { ok: false, message: NETWORK_MESSAGE }
  }
  if (!r.ok) return { ok: false, message: String(r.message ?? "That key wasn't recognised. Check it and try again.") }
  return {
    ok: true,
    state: { key: String(r.key ?? key), instanceId: String(r.instanceId), customerName: String(r.customerName ?? ''), activatedAt: new Date().toISOString() }
  }
}

/** After an in-app checkout: wait for Stripe's confirmation to reach the server, then activate this computer. */
export async function claimPurchase(
  sessionId: string,
  deps: LicenceDeps,
  opts: { attempts?: number; intervalMs?: number } = {}
): Promise<Result> {
  if (!deps.serverUrl) return { ok: false, message: NOT_SET_UP }
  const attempts = opts.attempts ?? 30
  const interval = opts.intervalMs ?? 2000
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await deps.fetch(`${deps.serverUrl.replace(/\/$/, '')}/claim?session_id=${encodeURIComponent(sessionId)}`)
      const r = (await res.json()) as Record<string, any>
      if (r.ready && r.key) return activate(String(r.key), deps)
    } catch {
      // network blip: keep trying
    }
    if (i < attempts - 1) await new Promise((res) => setTimeout(res, interval))
  }
  return { ok: false, message: STILL_CONFIRMING }
}

export async function deactivate(state: LicenceState, deps: LicenceDeps): Promise<{ ok: boolean; message?: string }> {
  if (!deps.serverUrl) return { ok: false, message: NOT_SET_UP }
  try {
    const r = await postJson(deps, '/licences/deactivate', { key: state.key, instanceId: state.instanceId })
    return r.ok ? { ok: true } : { ok: false, message: "Couldn't deactivate this computer. Try again, or contact support." }
  } catch {
    return { ok: false, message: NETWORK_MESSAGE }
  }
}

/** Local check only: never touches the network. */
export function isLicensed(state: LicenceState | null): boolean {
  return !!state?.key && !!state.instanceId
}
