// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/renderer/App'
import { appStore } from '../../src/renderer/state/store'
import { mockApi, sampleResult } from './helpers'

afterEach(cleanup)
beforeEach(() => appStore().getState().reset())

test('the start screen shows the Zen Sync logo', () => {
  mockApi()
  render(<App />)
  expect(screen.getByTestId('enso-logo')).toBeTruthy()
  expect(screen.getByRole('img', { name: 'Zen Sync' })).toBeTruthy()
})

test('the start screen asks what kind of event it is and remembers the choice', async () => {
  const { api } = mockApi()
  render(<App />)
  const select = (await screen.findByRole('combobox', { name: 'Type of event' })) as HTMLSelectElement
  await waitFor(() => expect(select.value).toBe('wedding'))
  fireEvent.change(select, { target: { value: 'corporate' } })
  await waitFor(() => expect(api.setEvent).toHaveBeenCalledWith('corporate'))
})

test('the liquid ensō fills with the analysing progress and lights the dot when done', async () => {
  let finish!: (v: ReturnType<typeof sampleResult>) => void
  const { listeners } = mockApi({ sort: () => new Promise((r) => (finish = r)) })
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
  await waitFor(() => expect(listeners.progress).toBeDefined())
  act(() => listeners.progress!({ stage: 'analyse', done: 62, total: 124 }))
  const fill = await screen.findByTestId('enso-loader')
  expect(fill.getAttribute('data-progress')).toBe('0.5')
  expect(fill.getAttribute('data-complete')).toBe('false')
  act(() => listeners.progress!({ stage: 'arrange', done: 0, total: 1 }))
  expect(screen.getByTestId('enso-loader').getAttribute('data-progress')).toBe('1')
  expect(screen.getByTestId('enso-loader').getAttribute('data-complete')).toBe('true')
  await act(async () => finish(sampleResult()))
})

test('the model download also fills the ensō', async () => {
  let finish!: (v: ReturnType<typeof sampleResult>) => void
  const { listeners } = mockApi({ sort: () => new Promise((r) => (finish = r)) })
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
  await waitFor(() => expect(listeners.download).toBeDefined())
  act(() => listeners.download!(40))
  expect((await screen.findByTestId('enso-loader')).getAttribute('data-progress')).toBe('0.4')
  await act(async () => finish(sampleResult()))
})
