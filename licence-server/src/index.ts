/**
 * Zen Sync licence server (Cloudflare Worker + D1).
 *
 * - POST /stripe/webhook        Stripe sends "checkout completed" / "refunded" events here (signature-verified).
 * - GET  /claim?session_id=…    The app polls this after checkout to receive the buyer's key.
 * - GET  /success?session_id=…  Thank-you page Stripe redirects to; shows the key.
 * - POST /licences/activate     { key, instanceName } → { ok, instanceId, customerName } (max 2 computers)
 * - POST /licences/deactivate   { key, instanceId } → { ok }
 *
 * The worker never needs the Stripe secret key: everything it uses arrives in signed webhook events.
 */

export const ACTIVATION_LIMIT = 2
const SIGNATURE_TOLERANCE_S = 300

interface D1Statement {
  bind(...values: unknown[]): D1Statement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ meta: { changes: number } }>
}
interface D1 {
  prepare(sql: string): D1Statement
}
export interface Env {
  DB: D1
  STRIPE_WEBHOOK_SECRET: string
  APP_NAME?: string
}

interface Licence {
  key: string
  email: string | null
  name: string | null
  status: string
}

const MESSAGES = {
  not_found: "That key wasn't recognised. Check it and try again.",
  revoked: 'This licence was refunded and is no longer active.',
  limit: `This key is already in use on ${ACTIVATION_LIMIT} computers. Deactivate one in its Settings, or contact support.`
} as const

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const now = () => new Date().toISOString()

// Crockford base32 (no I, L, O, U): easy to read aloud and type.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const chars = [...bytes].map((b) => ALPHABET[b % 32])
  return `ZS-${[0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-')}`
}

/** Accepts keys pasted in lower case, with spaces, or without dashes. */
export function normaliseKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const c = raw.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  const body = c.startsWith('ZS') ? c.slice(2) : c
  if (body.length !== 16) return null
  return `ZS-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12)}`
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Stripe webhook signature check (v1 scheme, HMAC-SHA256 of "timestamp.payload"). */
export async function verifyStripeSignature(payload: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !secret) return false
  const parts = header.split(',').map((p) => p.trim().split('='))
  const t = Number(parts.find(([k]) => k === 't')?.[1])
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > SIGNATURE_TOLERANCE_S) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)))
  return sigs.some((s) => safeEqual(s, expected))
}

async function handleWebhook(req: Request, env: Env): Promise<Response> {
  const payload = await req.text()
  if (!(await verifyStripeSignature(payload, req.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: 'invalid signature' }, 400)
  }
  let event: { id: string; type: string; livemode?: boolean; data: { object: Record<string, any> } }
  try {
    event = JSON.parse(payload)
  } catch {
    return json({ error: 'invalid payload' }, 400)
  }

  const seen = await env.DB.prepare('INSERT OR IGNORE INTO stripe_events (id, created_at) VALUES (?, ?)').bind(event.id, now()).run()
  if (!seen.meta.changes) return json({ received: true, duplicate: true })

  const obj = event.data.object
  if (
    (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') &&
    obj.payment_status === 'paid'
  ) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO licences (key, checkout_session, email, name, status, payment_intent, mode, created_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`
    )
      .bind(
        newKey(),
        obj.id,
        obj.customer_details?.email ?? null,
        obj.customer_details?.name ?? null,
        obj.payment_intent ?? null,
        event.livemode ? 'live' : 'test',
        now()
      )
      .run()
  } else if (event.type === 'charge.refunded' && obj.payment_intent) {
    await env.DB.prepare("UPDATE licences SET status = 'revoked' WHERE payment_intent = ?").bind(obj.payment_intent).run()
  }
  return json({ received: true })
}

async function licenceForSession(env: Env, session: string | null): Promise<Licence | null> {
  if (!session || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(session)) return null
  return env.DB.prepare('SELECT key, email, name, status FROM licences WHERE checkout_session = ?').bind(session).first<Licence>()
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = await req.json()
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function activate(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req)
  const key = normaliseKey(body?.key)
  if (!body || !key) return json({ ok: false, error: 'bad_request' }, 400)
  const lic = await env.DB.prepare('SELECT key, email, name, status FROM licences WHERE key = ?').bind(key).first<Licence>()
  if (!lic) return json({ ok: false, error: 'not_found', message: MESSAGES.not_found })
  if (lic.status !== 'active') return json({ ok: false, error: 'revoked', message: MESSAGES.revoked })
  const used = await env.DB.prepare('SELECT COUNT(*) AS n FROM activations WHERE licence_key = ?').bind(key).first<{ n: number }>()
  if ((used?.n ?? 0) >= ACTIVATION_LIMIT) return json({ ok: false, error: 'limit', message: MESSAGES.limit })
  const instanceId = crypto.randomUUID()
  const instanceName = String(body.instanceName ?? '').slice(0, 100)
  await env.DB.prepare('INSERT INTO activations (id, licence_key, instance_name, created_at) VALUES (?, ?, ?, ?)')
    .bind(instanceId, key, instanceName, now())
    .run()
  return json({ ok: true, key, instanceId, customerName: lic.name ?? lic.email ?? '' })
}

async function deactivate(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req)
  const key = normaliseKey(body?.key)
  if (!body || !key || typeof body.instanceId !== 'string') return json({ ok: false, error: 'bad_request' }, 400)
  await env.DB.prepare('DELETE FROM activations WHERE id = ? AND licence_key = ?').bind(body.instanceId, key).run()
  return json({ ok: true })
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function page(title: string, body: string, refresh = false): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${refresh ? '<meta http-equiv="refresh" content="2">' : ''}<title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1c1c1e;color:#e8e6e1;font-family:Inter,system-ui,sans-serif}
main{max-width:460px;padding:40px;text-align:center}h1{font-weight:500;font-size:22px}p{color:#a8a6a0;line-height:1.6}
code{display:inline-block;margin:12px 0;padding:12px 16px;border-radius:10px;background:#2a2a2d;color:#F3E3C3;font-size:18px;letter-spacing:1px;user-select:all}</style>
</head><body><main>${body}</main></body></html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

async function success(url: URL, env: Env): Promise<Response> {
  const lic = await licenceForSession(env, url.searchParams.get('session_id'))
  if (!lic) return page('Finishing your purchase', '<h1>Finishing your purchase…</h1><p>This takes a few seconds.</p>', true)
  const who = lic.name ?? lic.email ?? ''
  return page(
    'Thank you',
    `<h1>Thank you${who ? `, ${esc(who)}` : ''}</h1>
<p>Here's your Zen Sync licence key. Keep it somewhere safe: it works on two computers.</p><code>${esc(lic.key)}</code>
<p>If you bought from inside Zen Sync, it's already unlocked. Otherwise open Zen Sync, click <b>Unlock</b>, choose <b>I already bought it</b> and enter the key.</p>
<p>Your receipt is on its way from Stripe.</p>`
  )
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (req.method === 'POST' && url.pathname === '/stripe/webhook') return handleWebhook(req, env)
    if (req.method === 'POST' && url.pathname === '/licences/activate') return activate(req, env)
    if (req.method === 'POST' && url.pathname === '/licences/deactivate') return deactivate(req, env)
    if (req.method === 'GET' && url.pathname === '/claim') {
      const lic = await licenceForSession(env, url.searchParams.get('session_id'))
      return lic && lic.status === 'active'
        ? json({ ready: true, key: lic.key, customerName: lic.name ?? lic.email ?? '' })
        : json({ ready: false })
    }
    if (req.method === 'GET' && url.pathname === '/success') return success(url, env)
    if (req.method === 'GET' && url.pathname === '/') return json({ service: env.APP_NAME ?? 'Zen Sync', ok: true })
    return json({ error: 'not found' }, 404)
  }
}
