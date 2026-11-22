import { describe, expect, test, vi } from 'vitest'
import { activate, deactivate, isLicensed, type LicenceState } from '../../src/main/core/licence'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const deps = (fetch: typeof globalThis.fetch) => ({ fetch, instanceName: 'Ben PC', productId: 42 })

describe('activate', () => {
  test('POSTs the key and instance name and returns the licence state', async () => {
    const fetch = vi.fn(async () => json(200, {
      activated: true, error: null, instance: { id: 'inst-1', name: 'Ben PC' },
      meta: { customer_name: 'Jane Smith', product_id: 42 }
    }))
    const r = await activate('KEY-123', deps(fetch as never))
    expect(r).toMatchObject({ ok: true, state: { key: 'KEY-123', instanceId: 'inst-1', customerName: 'Jane Smith' } })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.lemonsqueezy.com/v1/licenses/activate')
    expect(init.method).toBe('POST')
    const body = new URLSearchParams(String(init.body))
    expect(body.get('license_key')).toBe('KEY-123')
    expect(body.get('instance_name')).toBe('Ben PC')
  })

  test('wrong product gives a clear message', async () => {
    const fetch = vi.fn(async () => json(200, { activated: true, instance: { id: 'i' }, meta: { customer_name: 'J', product_id: 7 } }))
    expect(await activate('K', deps(fetch as never))).toEqual({ ok: false, message: 'This key is for a different product.' })
  })

  test('activation limit reached', async () => {
    const fetch = vi.fn(async () => json(400, { activated: false, error: 'This license key has reached the activation limit.' }))
    expect(await activate('K', deps(fetch as never))).toEqual({
      ok: false,
      message: 'This key is already in use on 2 computers. Deactivate one in its Settings, or contact support.'
    })
  })

  test('unknown key', async () => {
    const fetch = vi.fn(async () => json(404, { activated: false, error: 'license_key not found.' }))
    expect(await activate('K', deps(fetch as never))).toEqual({ ok: false, message: "That key wasn't recognised. Check it and try again." })
  })

  test('network failure', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('fetch failed') })
    expect(await activate('K', deps(fetch as never))).toEqual({
      ok: false,
      message: "Couldn't reach the licence server. Check your internet connection and try again."
    })
  })

  test('trims whitespace from a pasted key', async () => {
    const fetch = vi.fn(async () => json(200, { activated: true, instance: { id: 'i' }, meta: { customer_name: 'J', product_id: 42 } }))
    await activate('  KEY-9 \n', deps(fetch as never))
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(new URLSearchParams(String(init.body)).get('license_key')).toBe('KEY-9')
  })
})

describe('isLicensed and deactivate', () => {
  const state: LicenceState = { key: 'K', instanceId: 'i1', customerName: 'J', activatedAt: '2026-11-22T00:00:00Z' }

  test('isLicensed is local only', () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    expect(isLicensed(state)).toBe(true)
    expect(isLicensed(null)).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockRestore()
  })

  test('deactivate POSTs key and instance id', async () => {
    const fetch = vi.fn(async () => json(200, { deactivated: true }))
    expect(await deactivate(state, deps(fetch as never))).toEqual({ ok: true })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.lemonsqueezy.com/v1/licenses/deactivate')
    const body = new URLSearchParams(String(init.body))
    expect(body.get('license_key')).toBe('K')
    expect(body.get('instance_id')).toBe('i1')
  })
})
