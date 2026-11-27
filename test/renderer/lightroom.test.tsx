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
    const { api } = mockApi({ takeLaunchFolder: vi.fn(async () => '/x/Lightroom export') })
    render(<App />)
    await waitFor(() => expect(api.sort).toHaveBeenCalledWith('/x/Lightroom export'))
  })

  test('an export arriving while the start screen is open is sorted', async () => {
    const { api, listeners } = mockApi()
    render(<App />)
    await waitFor(() => expect(listeners.openFolder).toBeTruthy())
    act(() => listeners.openFolder!('/x/next job'))
    await waitFor(() => expect(api.sort).toHaveBeenCalledWith('/x/next job'))
  })

  test('arriving mid-review with no changes made: the new export opens', async () => {
    const { api, listeners } = mockApi()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    await screen.findByText(/124 photos/)
    act(() => listeners.openFolder!('/x/next job'))
    await waitFor(() => expect(api.sort).toHaveBeenLastCalledWith('/x/next job'))
  })

  test('arriving after you have moved photos: asks first, and "Keep working" leaves things alone', async () => {
    const { api, listeners } = mockApi()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    await screen.findByText(/124 photos/)
    act(() => appStore().getState().sendToPart('ceremony'))
    act(() => listeners.openFolder!('/x/next job'))
    expect(await screen.findByText(/Lightroom sent photos from “next job”/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep working' }))
    expect(api.sort).toHaveBeenCalledTimes(1)
    act(() => listeners.openFolder!('/x/next job'))
    fireEvent.click(await screen.findByRole('button', { name: 'Open new photos' }))
    await waitFor(() => expect(api.sort).toHaveBeenLastCalledWith('/x/next job'))
  })

  test('Settings offers one click to add Zen Sync to Lightroom where Lightroom runs', async () => {
    const { api } = mockApi({ lightroomStatus: vi.fn(async () => ({ supported: true, installed: false })) })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    await screen.findByText(/124 photos/)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Lightroom' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add Zen Sync to Lightroom' }))
    await waitFor(() => expect(api.addToLightroom).toHaveBeenCalled())
    expect(await screen.findByText(/Added/)).toBeTruthy()
  })
})
