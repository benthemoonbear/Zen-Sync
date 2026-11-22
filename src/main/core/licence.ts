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
  productId: number
}

const API = 'https://api.lemonsqueezy.com/v1/licenses'
const NETWORK_MESSAGE = "Couldn't reach the licence server. Check your internet connection and try again."

async function post(deps: LicenceDeps, action: string, fields: Record<string, string>): Promise<{ status: number; body: Record<string, any> }> {
  const res = await deps.fetch(`${API}/${action}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString()
  })
  let body: Record<string, any> = {}
  try {
    body = (await res.json()) as Record<string, any>
  } catch {
    body = {}
  }
  return { status: res.status, body }
}

/** One-time online activation. After this the app never checks again. */
export async function activate(
  rawKey: string,
  deps: LicenceDeps
): Promise<{ ok: true; state: LicenceState } | { ok: false; message: string }> {
  const key = rawKey.trim()
  let r: Awaited<ReturnType<typeof post>>
  try {
    r = await post(deps, 'activate', { license_key: key, instance_name: deps.instanceName })
  } catch {
    return { ok: false, message: NETWORK_MESSAGE }
  }
  const { body } = r
  if (!body.activated) {
    const err = String(body.error ?? '').toLowerCase()
    if (err.includes('activation limit')) {
      return { ok: false, message: 'This key is already in use on 2 computers. Deactivate one in its Settings, or contact support.' }
    }
    if (r.status >= 500) return { ok: false, message: NETWORK_MESSAGE }
    return { ok: false, message: "That key wasn't recognised. Check it and try again." }
  }
  if (Number(body.meta?.product_id) !== deps.productId) return { ok: false, message: 'This key is for a different product.' }
  return {
    ok: true,
    state: {
      key,
      instanceId: String(body.instance?.id ?? ''),
      customerName: String(body.meta?.customer_name ?? ''),
      activatedAt: new Date().toISOString()
    }
  }
}

export async function deactivate(state: LicenceState, deps: LicenceDeps): Promise<{ ok: boolean; message?: string }> {
  try {
    const { body } = await post(deps, 'deactivate', { license_key: state.key, instance_id: state.instanceId })
    return body.deactivated ? { ok: true } : { ok: false, message: "Couldn't deactivate this computer. Try again, or contact support." }
  } catch {
    return { ok: false, message: NETWORK_MESSAGE }
  }
}

/** Local check only: never touches the network. */
export function isLicensed(state: LicenceState | null): boolean {
  return !!state?.key && !!state.instanceId
}
