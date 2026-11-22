// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/renderer/App'
import { appStore } from '../../src/renderer/state/store'
import { mockApi, sampleResult } from './helpers'
import type { Api } from '../../src/shared/api'

afterEach(cleanup)
beforeEach(() => appStore().getState().reset())

async function openSave(overrides: Partial<Api> = {}, result = sampleResult()) {
  const m = mockApi({ sort: async () => result, ...overrides })
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Save copies' }))
  await screen.findByRole('heading', { name: 'Save numbered copies' })
  return m
}

const small = () => ({ ...sampleResult(), photos: sampleResult().photos.slice(0, 20) })

describe('SaveDialog', () => {
  test('"Folder per part" shows a lock when unlicensed and opens the unlock panel', async () => {
    await openSave({}, small())
    const perPart = screen.getByRole('radio', { name: /Folder per part/ })
    expect(perPart.closest('label')!.textContent).toMatch(/£14\.99/)
    fireEvent.click(perPart)
    expect(await screen.findByRole('heading', { name: 'Unlock the full version' })).toBeTruthy()
  })

  test('more than 250 photos unlicensed opens the unlock panel on save', async () => {
    const big = { ...sampleResult(), photos: Array.from({ length: 251 }, (_, i) => ({ ...sampleResult().photos[0], path: `/w/p${i}.jpg`, name: `p${i}.jpg` })) }
    const { api } = await openSave({}, big)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Free version saves up to 250 photos')).toBeTruthy()
    expect(api.save).not.toHaveBeenCalled()
  })

  test('asks before replacing an existing numbered folder', async () => {
    const save = vi.fn<Api['save']>()
      .mockResolvedValueOnce({ exists: true })
      .mockResolvedValueOnce({ written: 20, outDir: '/w/bakewell wedding/numbered' })
    await openSave({ save }, small())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('A numbered folder is already here. Replace it?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ overwrite: true, mode: 'single' })))
  })

  test('success shows the count and Show folder', async () => {
    const { api } = await openSave({ save: async () => ({ written: 20, outDir: '/w/bakewell wedding/numbered' }) }, small())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved 20 photos to numbered')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show folder' }))
    expect(api.showFolder).toHaveBeenCalledWith('/w/bakewell wedding/numbered')
  })

  test('saves the order shown on screen', async () => {
    const { api } = await openSave({}, small())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.save).toHaveBeenCalled())
    const req = (api.save as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(req.photos.map((p: { name: string }) => p.name)).toEqual(appStore().getState().photos.map((p) => p.name))
    expect(req.dir).toBe('/w/bakewell wedding')
  })
})

describe('UnlockDialog', () => {
  test('Buy opens the store; a pasted key activates', async () => {
    const { api } = await openSave({}, small())
    fireEvent.click(screen.getByRole('radio', { name: /Folder per part/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Buy for £14.99' }))
    expect(api.openBuyPage).toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Licence key'), { target: { value: 'KEY-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(await screen.findByText('Licensed to Jane Smith')).toBeTruthy()
    expect(api.activate).toHaveBeenCalledWith('KEY-1')
  })

  test('shows activation errors inline', async () => {
    await openSave({ activate: async () => ({ ok: false as const, message: "That key wasn't recognised. Check it and try again." }) }, small())
    fireEvent.click(screen.getByRole('radio', { name: /Folder per part/ }))
    fireEvent.change(await screen.findByLabelText('Licence key'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(await screen.findByText("That key wasn't recognised. Check it and try again.")).toBeTruthy()
  })
})

describe('SettingsDialog', () => {
  async function openSettings(overrides: Partial<Api> = {}) {
    const m = mockApi(overrides)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    await screen.findByRole('heading', { name: 'Settings' })
    return m
  }

  test('parts can be renamed, added, removed and moved, then saved', async () => {
    const { api } = await openSettings()
    const inputs = () => screen.getAllByLabelText(/Part \d+ name/) as HTMLInputElement[]
    await waitFor(() => expect(inputs()).toHaveLength(6))
    fireEvent.change(inputs()[0], { target: { value: 'Prep' } })
    fireEvent.click(screen.getByRole('button', { name: 'Move Details up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Signing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a part' }))
    fireEvent.change(inputs()[inputs().length - 1], { target: { value: 'Sparklers' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(api.setParts).toHaveBeenCalled())
    const saved = (api.setParts as ReturnType<typeof vi.fn>).mock.calls[0][0] as { name: string }[]
    expect(saved.map((p) => p.name)).toEqual(['Details', 'Prep', 'Arrival', 'Ceremony', 'Confetti', 'Sparklers'])
  })

  test('licence section shows the owner and deactivates', async () => {
    const { api } = await openSettings({ licence: async () => ({ licensed: true, customerName: 'Jane Smith' }) })
    expect(await screen.findByText('Licensed to Jane Smith')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate this computer' }))
    await waitFor(() => expect(api.deactivate).toHaveBeenCalled())
  })
})

test('number keys do nothing while a dialog is open', async () => {
  mockApi({ sort: async () => small() })
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Save copies' }))
  await screen.findByRole('heading', { name: 'Save numbered copies' })
  const before = appStore().getState().photos.map((p) => p.partId)
  fireEvent.keyDown(window, { key: '4' })
  expect(appStore().getState().photos.map((p) => p.partId)).toEqual(before)
})
