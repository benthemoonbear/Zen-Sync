// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  test('Buy for £14.99 runs the in-app checkout and unlocks with no key to type', async () => {
    const { api } = await openSave({}, small())
    fireEvent.click(screen.getByRole('radio', { name: /Folder per part/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Buy for £14.99' }))
    expect(api.buy).toHaveBeenCalled()
    expect(await screen.findByText('Licensed to Jane Smith')).toBeTruthy()
  })

  test('while checkout is open the panel says so; closing it returns to the offer', async () => {
    let finish!: (v: Awaited<ReturnType<Api['buy']>>) => void
    await openSave({ buy: () => new Promise((r) => (finish = r)) }, small())
    fireEvent.click(screen.getByRole('radio', { name: /Folder per part/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Buy for £14.99' }))
    expect(await screen.findByText('Complete your purchase in the checkout window…')).toBeTruthy()
    await act(async () => finish({ ok: false, cancelled: true }))
    expect(await screen.findByRole('button', { name: 'Buy for £14.99' })).toBeTruthy()
  })

  test('a pasted key still activates (second computer)', async () => {
    const { api } = await openSave({}, small())
    fireEvent.click(screen.getByRole('radio', { name: /Folder per part/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'I already bought it' }))
    fireEvent.change(screen.getByLabelText('Licence key'), { target: { value: 'KEY-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(await screen.findByText('Licensed to Jane Smith')).toBeTruthy()
    expect(api.activate).toHaveBeenCalledWith('KEY-1')
  })

  test('shows activation errors inline', async () => {
    await openSave({ activate: async () => ({ ok: false as const, message: "That key wasn't recognised. Check it and try again." }) }, small())
    fireEvent.click(screen.getByRole('radio', { name: /Folder per part/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'I already bought it' }))
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

  test('licence section shows the owner, the key for a second computer, and deactivates', async () => {
    const { api } = await openSettings({ licence: async () => ({ licensed: true, customerName: 'Jane Smith', key: 'ZS-AAAA-BBBB-CCCC-DDDD' }) })
    expect(await screen.findByText('Licensed to Jane Smith')).toBeTruthy()
    expect(screen.getByText('ZS-AAAA-BBBB-CCCC-DDDD')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate this computer' }))
    await waitFor(() => expect(api.deactivate).toHaveBeenCalled())
  })

  test('parts can be put inside a folder (group)', async () => {
    const { api } = await openSettings()
    const folder = (await screen.findByLabelText('Folder for Details')) as HTMLInputElement
    fireEvent.change(folder, { target: { value: 'Morning' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(api.setParts).toHaveBeenCalled())
    const saved = (api.setParts as ReturnType<typeof vi.fn>).mock.calls[0][0] as { name: string; group?: string }[]
    expect(saved.find((p) => p.name === 'Details')!.group).toBe('Morning')
  })

  test('switching the event type in Settings loads that event\'s parts', async () => {
    const { api } = await openSettings({
      getParts: vi.fn()
        .mockResolvedValueOnce([{ id: 'a', name: 'Getting ready', prompts: ['x'] }])
        .mockResolvedValue([{ id: 'talks', name: 'Talks and presentations', prompts: ['y'] }])
    })
    fireEvent.change(await screen.findByRole('combobox', { name: 'Type of event' }), { target: { value: 'corporate' } })
    await waitFor(() => expect(api.setEvent).toHaveBeenCalledWith('corporate'))
    expect(await screen.findByDisplayValue('Talks and presentations')).toBeTruthy()
  })

  test('reset puts back the default parts for the event', async () => {
    const { api } = await openSettings()
    fireEvent.click(await screen.findByRole('button', { name: 'Reset to defaults' }))
    await waitFor(() => expect(api.setParts).toHaveBeenCalledWith([]))
    expect(api.getParts).toHaveBeenCalledTimes(2)
  })

  test('an unlicensed user can enter a key they bought from Settings', async () => {
    const { api } = await openSettings()
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }))
    fireEvent.click(await screen.findByRole('button', { name: 'I already bought it' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ZS-AAAA-BBBB-CCCC-DDDD' } })
    fireEvent.click(screen.getByRole('button', { name: /Activate/ }))
    await waitFor(() => expect(api.activate).toHaveBeenCalledWith('ZS-AAAA-BBBB-CCCC-DDDD'))
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
