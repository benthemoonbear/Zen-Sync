import { describe, expect, test, vi } from 'vitest'
import { activate, claimPurchase, deactivate, isLicensed, type LicenceState } from '../../src/main/core/licence'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const SERVER = 'https://licences.example'
const deps = (fetch: typeof globalThis.fetch) => ({ fetch, instanceName: 'Ben PC', serverUrl: SERVER })
const ok = (body: unknown) => json(200, body)

describe('activate', () => {
  test('POSTs the key and computer name to the licence server and returns the licence state', async () => {
    const fetch = vi.fn(async () => ok({ ok: true, key: 'ZS-AAAA-BBBB-CCCC-DDDD', instanceId: 'inst-1', customerName: 'Jane Smith' }))
    const r = await activate('zs-aaaa-bbbb-cccc-dddd', deps(fetch as never))
    expect(r).toMatchObject({ ok: true, state: { key: 'ZS-AAAA-BBBB-CCCC-DDDD', instanceId: 'inst-1', customerName: 'Jane Smith' } })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${SERVER}/licences/activate`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ key: 'zs-aaaa-bbbb-cccc-dddd', instanceName: 'Ben PC' })
  })

  test('passes the server message through when it refuses', async () => {
    const fetch = vi.fn(async () => ok({ ok: false, error: 'limit', message: 'This key is already in use on 2 computers. Deactivate one in its Settings, or contact support.' }))
    expect(await activate('K', deps(fetch as never))).toEqual({
      ok: false,
      message: 'This key is already in use on 2 computers. Deactivate one in its Settings, or contact support.'
    })
  })

  test('network failure', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('fetch failed') })
    expect(await activate('K', deps(fetch as never))).toEqual({
      ok: false,
      message: "Couldn't reach the licence server. Check your internet connection and try again."
    })
  })

  test('trims whitespace from a pasted key', async () => {
    const fetch = vi.fn(async () => ok({ ok: true, key: 'K', instanceId: 'i', customerName: 'J' }))
    await activate('  KEY-9 \n', deps(fetch as never))
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).key).toBe('KEY-9')
  })

  test('a build without a licence server refuses without calling the network', async () => {
    const fetch = vi.fn()
    expect(await activate('K', { fetch: fetch as never, instanceName: 'x', serverUrl: '' })).toEqual({
      ok: false,
      message: "This copy of the app isn't set up for licences yet. Contact support."
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('claimPurchase', () => {
  test('waits for the payment to be confirmed, then activates this computer', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(ok({ ready: false }))
      .mockResolvedValueOnce(ok({ ready: true, key: 'ZS-AAAA-BBBB-CCCC-DDDD', customerName: 'Jane Smith' }))
      .mockResolvedValueOnce(ok({ ok: true, key: 'ZS-AAAA-BBBB-CCCC-DDDD', instanceId: 'inst-7', customerName: 'Jane Smith' }))
    const r = await claimPurchase('cs_test_123', deps(fetch as never), { attempts: 5, intervalMs: 1 })
    expect(r).toMatchObject({ ok: true, state: { key: 'ZS-AAAA-BBBB-CCCC-DDDD', instanceId: 'inst-7', customerName: 'Jane Smith' } })
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe(`${SERVER}/claim?session_id=cs_test_123`)
  })

  test('gives up with a helpful message if the payment never shows up', async () => {
    const fetch = vi.fn(async () => ok({ ready: false }))
    expect(await claimPurchase('cs_test_123', deps(fetch as never), { attempts: 3, intervalMs: 1 })).toEqual({
      ok: false,
      message: "Your payment is still being confirmed. Check your email for your licence key, or try again in a minute."
    })
    expect(fetch).toHaveBeenCalledTimes(3)
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
    const fetch = vi.fn(async () => ok({ ok: true }))
    expect(await deactivate(state, deps(fetch as never))).toEqual({ ok: true })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${SERVER}/licences/deactivate`)
    expect(JSON.parse(String(init.body))).toEqual({ key: 'K', instanceId: 'i1' })
  })
})
