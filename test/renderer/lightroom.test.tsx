// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/renderer/App'
import { appStore } from '../../src/renderer/state/store'
import { mockApi } from './helpers'

afterEach(cleanup)
beforeEach(() => appStore().getState().reset())

describe('photos sent from Lightroom', () => {
  test('an export that started Zen Sync is sorted straight away', async () => {
    const { api } = mockApi({ takeLaunchFolder: vi.fn(async () => ({ dir: '/x/Lightroom export', photos: ['/x/Lightroom export/a.jpg'] })) })
    render(<App />)
    await waitFor(() => expect(api.sort).toHaveBeenCalledWith('/x/Lightroom export', ['/x/Lightroom export/a.jpg']))
  })

  test('an export arriving while the start screen is open is sorted', async () => {
    const { api, listeners } = mockApi()
    render(<App />)
    await waitFor(() => expect(listeners.openFolder).toBeTruthy())
    act(() => listeners.openFolder!({ dir: '/x/next job', photos: [] }))
    await waitFor(() => expect(api.sort).toHaveBeenCalledWith('/x/next job'))
  })

  test('arriving mid-review with no changes made: the new export opens', async () => {
    const { api, listeners } = mockApi()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    await screen.findByText(/124 photos/)
    act(() => listeners.openFolder!({ dir: '/x/next job', photos: [] }))
    await waitFor(() => expect(api.sort).toHaveBeenLastCalledWith('/x/next job'))
  })

  test('arriving after you have moved photos: asks first, and "Keep working" leaves things alone', async () => {
    const { api, listeners } = mockApi()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    await screen.findByText(/124 photos/)
    act(() => appStore().getState().sendToPart('ceremony'))
    act(() => listeners.openFolder!({ dir: '/x/next job', photos: [] }))
    expect(await screen.findByText(/New photos from “next job”/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep working' }))
    expect(api.sort).toHaveBeenCalledTimes(1)
    act(() => listeners.openFolder!({ dir: '/x/next job', photos: [] }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open new photos' }))
    await waitFor(() => expect(api.sort).toHaveBeenLastCalledWith('/x/next job'))
  })

  test('Settings offers one click to add Zen Sync to Lightroom where Lightroom runs', async () => {
    const { api } = mockApi({ lightroomStatus: vi.fn(async () => ({ supported: true, installed: false })) })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    await screen.findByText(/124 photos/)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Editors' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add Zen Sync to Lightroom' }))
    await waitFor(() => expect(api.addToLightroom).toHaveBeenCalled())
    expect(await screen.findByText(/Added/)).toBeTruthy()
  })
})

async function openEditors(overrides: Parameters<typeof mockApi>[0] = {}) {
  const m = mockApi(overrides)
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
  await screen.findByText(/124 photos/)
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.click(await screen.findByRole('tab', { name: 'Editors' }))
  return m
}

describe('Settings > Editors', () => {
  test('Capture One: shows where to set it up and copies Zen Sync’s location to paste in', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    await openEditors()
    fireEvent.click(screen.getByRole('radio', { name: 'Capture One' }))
    expect(screen.getAllByText(/Open With/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Copy Zen Sync’s location' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('C:\\Users\\Ben\\Zen Sync\\Zen Sync.exe'))
    expect(await screen.findByText('Copied')).toBeTruthy()
  })

  test('DxO PhotoLab and ON1 have their own steps', async () => {
    await openEditors()
    fireEvent.click(screen.getByRole('radio', { name: 'DxO PhotoLab' }))
    expect(screen.getAllByText(/Export to Application/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('radio', { name: 'ON1 Photo RAW' }))
    expect(screen.getAllByText(/Send to Other Application/).length).toBeGreaterThan(0)
  })

  test('darktable: one click adds Zen Sync as an export destination where darktable is set up', async () => {
    const { api } = await openEditors({ darktableSupported: vi.fn(async () => true) })
    fireEvent.click(screen.getByRole('radio', { name: 'darktable' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add Zen Sync to darktable' }))
    await waitFor(() => expect(api.addToDarktable).toHaveBeenCalled())
    expect(await screen.findByText(/Added/)).toBeTruthy()
  })

  test('any other editor: watch a folder, and stop watching', async () => {
    const { api } = await openEditors()
    fireEvent.click(screen.getByRole('radio', { name: 'Any other app' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose a folder to watch' }))
    expect(await screen.findByText('/w/Exports')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stop watching' }))
    await waitFor(() => expect(api.clearWatchFolder).toHaveBeenCalled())
    expect(screen.queryByText('/w/Exports')).toBeNull()
  })
})
