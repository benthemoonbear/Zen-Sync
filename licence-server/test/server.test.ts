import { beforeEach, describe, expect, test } from 'vitest'
import worker, { ACTIVATION_LIMIT } from '../src/index'
import { fakeD1 } from './fakeD1'

const SECRET = 'whsec_test_secret'
let env: { DB: ReturnType<typeof fakeD1>; STRIPE_WEBHOOK_SECRET: string; APP_NAME: string }

beforeEach(() => {
  env = { DB: fakeD1(), STRIPE_WEBHOOK_SECRET: SECRET, APP_NAME: 'Zen Sync' }
})

async function sign(payload: string, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`))
  return `t=${t},v1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

async function webhook(event: object, opts: { secret?: string; t?: number } = {}) {
  const body = JSON.stringify(event)
  return worker.fetch(
    new Request('https://licences.example/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': await sign(body, opts.secret, opts.t) },
      body
    }),
    env as never
  )
}

const completed = (id = 'evt_1', session = 'cs_test_1', extra: object = {}) => ({
  id,
  type: 'checkout.session.completed',
  livemode: false,
  data: {
    object: {
      id: session,
      payment_status: 'paid',
      payment_intent: 'pi_1',
      customer_details: { email: 'jane@example.com', name: 'Jane Smith' },
      ...extra
    }
  }
})

const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://licences.example${path}`, init), env as never)
const post = (path: string, body: object) =>
  call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('stripe webhook', () => {
  test('a paid checkout creates one licence for the buyer', async () => {
    expect((await webhook(completed())).status).toBe(200)
    const r = await (await call('/claim?session_id=cs_test_1')).json()
    expect(r).toMatchObject({ ready: true, customerName: 'Jane Smith' })
    expect(r.key).toMatch(/^ZS(-[0-9A-HJKMNP-TV-Z]{4}){4}$/)
  })

  test('rejects a bad signature', async () => {
    expect((await webhook(completed(), { secret: 'whsec_wrong' })).status).toBe(400)
    expect(await (await call('/claim?session_id=cs_test_1')).json()).toEqual({ ready: false })
  })

  test('rejects an old signature (replay)', async () => {
    expect((await webhook(completed(), { t: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(400)
  })

  test('the same event or session twice still gives one licence', async () => {
    await webhook(completed('evt_1'))
    await webhook(completed('evt_1'))
    await webhook(completed('evt_2'))
    const rows = env.DB.raw.prepare('select count(*) n from licences').get() as { n: number }
    expect(rows.n).toBe(1)
  })

  test('an unpaid checkout creates nothing', async () => {
    await webhook(completed('evt_1', 'cs_test_1', { payment_status: 'unpaid' }))
    expect(await (await call('/claim?session_id=cs_test_1')).json()).toEqual({ ready: false })
  })

  test('a delayed payment that succeeds later creates the licence', async () => {
    await webhook({ ...completed('evt_9', 'cs_test_9', { payment_status: 'paid' }), type: 'checkout.session.async_payment_succeeded' })
    expect((await (await call('/claim?session_id=cs_test_9')).json()).ready).toBe(true)
  })

  test('a refund revokes the licence', async () => {
    await webhook(completed())
    const { key } = await (await call('/claim?session_id=cs_test_1')).json()
    await webhook({ id: 'evt_r', type: 'charge.refunded', data: { object: { payment_intent: 'pi_1', refunded: true } } })
    expect(await (await post('/licences/activate', { key, instanceName: 'PC' })).json()).toEqual({
      ok: false,
      error: 'revoked',
      message: 'This licence was refunded and is no longer active.'
    })
  })

  test('ignores other event types', async () => {
    expect((await webhook({ id: 'evt_x', type: 'customer.created', data: { object: {} } })).status).toBe(200)
  })
})

describe('activation', () => {
  async function licence() {
    await webhook(completed())
    return (await (await call('/claim?session_id=cs_test_1')).json()).key as string
  }

  test(`activates up to ${2} computers, then refuses`, async () => {
    expect(ACTIVATION_LIMIT).toBe(2)
    const key = await licence()
    const a = await (await post('/licences/activate', { key, instanceName: 'Desktop' })).json()
    const b = await (await post('/licences/activate', { key: key.toLowerCase(), instanceName: 'Laptop' })).json()
    expect(a).toMatchObject({ ok: true, customerName: 'Jane Smith' })
    expect(b.ok).toBe(true)
    expect(a.instanceId).not.toBe(b.instanceId)
    expect(await (await post('/licences/activate', { key, instanceName: 'Third' })).json()).toEqual({
      ok: false,
      error: 'limit',
      message: 'This key is already in use on 2 computers. Deactivate one in its Settings, or contact support.'
    })
  })

  test('deactivating frees a slot', async () => {
    const key = await licence()
    const a = await (await post('/licences/activate', { key, instanceName: 'A' })).json()
    await post('/licences/activate', { key, instanceName: 'B' })
    expect(await (await post('/licences/deactivate', { key, instanceId: a.instanceId })).json()).toEqual({ ok: true })
    expect((await (await post('/licences/activate', { key, instanceName: 'C' })).json()).ok).toBe(true)
  })

  test('unknown key', async () => {
    expect(await (await post('/licences/activate', { key: 'ZS-AAAA-AAAA-AAAA-AAAA', instanceName: 'X' })).json()).toEqual({
      ok: false,
      error: 'not_found',
      message: "That key wasn't recognised. Check it and try again."
    })
  })

  test('accepts a key pasted with spaces or missing dashes', async () => {
    const key = await licence()
    const messy = `  ${key.replaceAll('-', ' ').toLowerCase()} \n`
    expect((await (await post('/licences/activate', { key: messy, instanceName: 'X' })).json()).ok).toBe(true)
  })

  test('bad requests are rejected', async () => {
    expect((await post('/licences/activate', {})).status).toBe(400)
    expect((await call('/licences/activate', { method: 'POST', body: 'not json' })).status).toBe(400)
  })
})

describe('pages', () => {
  test('success page shows the key once the webhook has arrived', async () => {
    await webhook(completed())
    const html = await (await call('/success?session_id=cs_test_1')).text()
    expect(html).toContain('Thank you, Jane Smith')
    expect(html).toMatch(/ZS-[0-9A-Z]{4}-/)
  })

  test('success page asks to wait (and refreshes) before the webhook arrives', async () => {
    const res = await call('/success?session_id=cs_test_unknown')
    const html = await res.text()
    expect(html).toContain('Finishing your purchase')
    expect(html).toContain('http-equiv="refresh"')
  })

  test('success page escapes the buyer name', async () => {
    await webhook(completed('evt_1', 'cs_test_1', { customer_details: { email: 'a@b.c', name: '<script>x</script>' } }))
    const html = await (await call('/success?session_id=cs_test_1')).text()
    expect(html).not.toContain('<script>x')
  })

  test('unknown routes 404', async () => {
    expect((await call('/nope')).status).toBe(404)
  })
})
