// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/renderer/App'
import { appStore } from '../../src/renderer/state/store'
import { mockApi, sampleResult } from './helpers'

afterEach(cleanup)
beforeEach(() => appStore().getState().reset())

async function openReview(overrides: Parameters<typeof mockApi>[0] = {}) {
  const m = mockApi(overrides)
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
  await screen.findByText(/124 photos/)
  return m
}

describe('drop screen', () => {
  test('"Choose folder" calls api.chooseFolder then sorts it', async () => {
    const { api } = mockApi()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    await waitFor(() => expect(api.sort).toHaveBeenCalledWith('/w/bakewell wedding'))
  })

  test('dropping a folder sorts the dropped path', async () => {
    const { api } = mockApi()
    render(<App />)
    const file = new File([''], 'dropped wedding')
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [file], types: ['Files'] } })
    await waitFor(() => expect(api.sort).toHaveBeenCalledWith('/w/dropped wedding'))
  })

  test('shows progress and model download messages', async () => {
    let finish!: (v: ReturnType<typeof sampleResult>) => void
    const { listeners } = mockApi({ sort: () => new Promise((r) => (finish = r)) })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    await waitFor(() => expect(listeners.progress).toBeDefined())
    act(() => listeners.download!(37))
    expect(await screen.findByText('Downloading the photo model (one time only) — 37%')).toBeTruthy()
    act(() => listeners.progress!({ stage: 'analyse', done: 40, total: 124 }))
    expect(await screen.findByText('Analysing 40 of 124')).toBeTruthy()
    await act(async () => finish(sampleResult()))
  })

  test('shows an error when sorting fails', async () => {
    mockApi({ sort: async () => { throw new Error('boom') } })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    expect(await screen.findByText(/Couldn't sort that folder/)).toBeTruthy()
  })
})

describe('review screen', () => {
  test('header shows folder name, photo and camera counts', async () => {
    await openReview()
    expect(screen.getByRole('heading', { name: 'bakewell wedding' })).toBeTruthy()
    expect(screen.getByText('124 photos, 2 cameras')).toBeTruthy()
  })

  test('"Next unsure" shows how many photos are unsure', async () => {
    await openReview()
    const unsure = document.querySelectorAll('.tile.unsure').length
    expect(unsure).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: `Next unsure, ${unsure} left` })).toBeTruthy()
  })

  test('clock banner offers Fix and Ignore', async () => {
    const { api } = await openReview()
    expect(screen.getByText('ILCE-7RM2 clock looks 8h 35m slow')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fix' }))
    await waitFor(() => expect(api.applyClockFix).toHaveBeenCalledWith('prefix:BHV'))
    await waitFor(() => expect(screen.queryByText(/clock looks/)).toBeNull())
  })

  test('Ignore hides the clock banner', async () => {
    await openReview()
    fireEvent.click(screen.getByRole('button', { name: 'Ignore' }))
    expect(screen.queryByText(/clock looks/)).toBeNull()
  })

  test('timeline renders one section per non-empty part with width proportional to count', async () => {
    await openReview()
    const sections = screen.getAllByTestId('timeline-section')
    expect(sections.map((s) => s.getAttribute('data-part'))).toEqual(['arrival', 'ceremony', 'confetti'])
    expect(sections.map((s) => (s as HTMLElement).style.flexGrow)).toEqual(['9', '25', '90'])
  })

  test('ArrowRight selects the next photo; "4" sends it to the 4th part and records a correction', async () => {
    const { api } = await openReview()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('preview-number').textContent).toBe('2')
    fireEvent.keyDown(window, { key: '4' })
    const moved = appStore().getState().photos.find((p) => p.name === 'IMG1.jpg')!
    expect(moved.partId).toBe('ceremony')
    expect(api.recordCorrection).toHaveBeenCalledWith('/w/bakewell wedding/IMG1.jpg', 'ceremony')
  })

  test('"Next unsure" selects the next unsure photo', async () => {
    await openReview()
    fireEvent.click(screen.getByRole('button', { name: /Next unsure/ }))
    expect(screen.getByTestId('preview-number').textContent).toBe('13')
  })

  test('preview shows number, part, camera and time', async () => {
    await openReview()
    expect(screen.getByTestId('preview-part').textContent).toBe('Arrival')
    expect(screen.getByTestId('preview-meta').textContent).toBe('ILME-FX3, 11:47')
  })

  test('the selected photo glows behind the whole screen and follows the selection', async () => {
    await openReview()
    const glow = () => (screen.getByTestId('ambient') as HTMLElement).style.backgroundImage
    const first = glow()
    expect(first).toContain('thumb://')
    fireEvent.click(screen.getByRole('button', { name: /Next unsure/ }))
    expect(glow()).not.toBe(first)
  })

  test('Shift-click selects a range and Ctrl-click adds one more', async () => {
    await openReview()
    const tiles = screen.getAllByTestId('tile')
    fireEvent.click(tiles[0])
    fireEvent.click(tiles[3], { shiftKey: true })
    expect(document.querySelectorAll('.tile.selected')).toHaveLength(4)
    fireEvent.click(tiles[10], { ctrlKey: true })
    expect(document.querySelectorAll('.tile.selected')).toHaveLength(5)
  })

  test('Ctrl+A selects every photo and Esc goes back to one', async () => {
    await openReview()
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
    expect(document.querySelectorAll('.tile.selected')).toHaveLength(124)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelectorAll('.tile.selected')).toHaveLength(1)
  })

  test('Shift+arrow grows the selection', async () => {
    await openReview()
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true })
    expect(document.querySelectorAll('.tile.selected')).toHaveLength(3)
  })

  test('custom shortcuts from Settings replace the defaults', async () => {
    await openReview({ getShortcuts: async () => ({ next: 'D' }) })
    await waitFor(() => {
      fireEvent.keyDown(window, { key: 'd' })
      expect(screen.getByTestId('preview-number').textContent).toBe('2')
    })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('preview-number').textContent).toBe('2')
  })

  test('Ctrl+S opens the save window', async () => {
    await openReview()
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect(await screen.findByText('Save numbered copies')).toBeTruthy()
  })

  test('dragging several selected photos shows how many are moving', async () => {
    await openReview()
    const tiles = screen.getAllByTestId('tile')
    fireEvent.click(tiles[0])
    fireEvent.click(tiles[2], { shiftKey: true })
    expect(screen.getByTestId('selection-count').textContent).toBe('3 selected')
  })

  test('skipped files are listed on click', async () => {
    mockApi({ sort: async () => ({ ...sampleResult(), skipped: [{ name: 'a.jpg', reason: "Couldn't read this file" }, { name: 'b.jpg', reason: "Couldn't read this file" }] }) })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    fireEvent.click(await screen.findByRole('button', { name: "2 files couldn't be read" }))
    expect(screen.getByText(/a\.jpg/)).toBeTruthy()
  })
})

test('a failed model download shows a connection message', async () => {
  appStore().getState().reset()
  mockApi({ sort: async () => { throw new Error("Error invoking remote method 'api:sort': Error: MODEL_DOWNLOAD_FAILED") } })
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
  expect(await screen.findByText("Couldn't download the photo model. Check your internet connection and try again — it's only needed once.")).toBeTruthy()
})

test('a model failure shows a model message, not "no photos found"', async () => {
  appStore().getState().reset()
  mockApi({ sort: async () => { throw new Error("Error invoking remote method 'api:sort': Error: MODEL_FAILED") } })
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
  expect(await screen.findByText("The photo model couldn't run on this computer. Close other apps and try again.")).toBeTruthy()
})
