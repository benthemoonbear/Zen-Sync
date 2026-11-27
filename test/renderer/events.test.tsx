// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '../../src/renderer/App'
import { appStore } from '../../src/renderer/state/store'
import { mockApi, sampleResult } from './helpers'

afterEach(cleanup)
beforeEach(() => appStore().getState().reset())

const events = [
  { id: 'wedding', name: 'Wedding' },
  { id: 'corporate', name: 'Corporate event' },
  { id: 'custom-1', name: 'Bar mitzvah', custom: true }
]

describe('dynamic events', () => {
  test('the start screen offers Automatic, which is the default', async () => {
    mockApi({ getEvents: vi.fn(async () => ({ current: 'auto', events })) })
    render(<App />)
    const select = (await screen.findByRole('combobox', { name: 'Type of event' })) as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('auto'))
    expect(within(select).getByRole('option', { name: /Automatic/ })).toBeTruthy()
    expect(within(select).getByRole('option', { name: 'Bar mitzvah' })).toBeTruthy()
  })

  test('the review says which event type was detected, and switching re-sorts as that type', async () => {
    const detected = { ...sampleResult(), event: { id: 'wedding', name: 'Wedding', detected: true } }
    const corporate = { ...sampleResult(), event: { id: 'corporate', name: 'Corporate event', detected: false } }
    const { api } = mockApi({ getEvents: vi.fn(async () => ({ current: 'auto', events })), sort: async () => detected, resortAs: vi.fn(async () => corporate) })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    const chip = (await screen.findByRole('combobox', { name: 'Sorted as' })) as HTMLSelectElement
    expect(screen.getByText('Detected')).toBeTruthy()
    await waitFor(() => expect(chip.value).toBe('wedding'))
    fireEvent.change(chip, { target: { value: 'corporate' } })
    await waitFor(() => expect(api.resortAs).toHaveBeenCalledWith('corporate'))
    await waitFor(() => expect(screen.queryByText('Detected')).toBeNull())
  })

  test('a moment that is not on the list is suggested; adding it makes a new part with those photos', async () => {
    const r = sampleResult()
    const paths = r.photos.slice(40, 46).map((p) => p.path)
    const withMoment = { ...r, moments: [{ name: 'Fireworks', paths, afterPartId: 'ceremony' }] }
    mockApi({ sort: async () => withMoment })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    expect(await screen.findByText(/Fireworks/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add Fireworks as a part' }))
    const s = appStore().getState()
    const id = s.parts.find((p) => p.name === 'Fireworks')!.id
    expect(s.photos.filter((p) => p.partId === id).map((p) => p.path).sort()).toEqual([...paths].sort())
    expect(s.partOrder.indexOf(id)).toBe(s.partOrder.indexOf('ceremony') + 1)
    expect(screen.queryByRole('button', { name: 'Add Fireworks as a part' })).toBeNull()
  })

  test('a suggested moment can be dismissed', async () => {
    const r = sampleResult()
    mockApi({ sort: async () => ({ ...r, moments: [{ name: 'Fireworks', paths: [r.photos[0].path], afterPartId: null }] }) })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss Fireworks' }))
    expect(screen.queryByText(/Fireworks/)).toBeNull()
  })

  test('Settings: make your own event type, and only your own can be renamed or deleted', async () => {
    const { api } = mockApi({ getEvents: vi.fn(async () => ({ current: 'auto', events })) })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    const picker = (await screen.findByRole('combobox', { name: 'Event type to edit' })) as HTMLSelectElement
    expect(within(picker).queryByRole('option', { name: /Automatic/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete event type' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'New event type' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name of the new event type' }), { target: { value: 'Prom' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(api.createEvent).toHaveBeenCalledWith('Prom'))
    fireEvent.change(picker, { target: { value: 'custom-1' } })
    await waitFor(() => expect(api.getParts).toHaveBeenLastCalledWith('custom-1'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete event type' }))
    await waitFor(() => expect(api.deleteEvent).toHaveBeenCalledWith('custom-1'))
  })
})
