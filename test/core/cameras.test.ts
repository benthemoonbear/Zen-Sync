import { describe, expect, test } from 'vitest'
import { fileNumber, groupCameras } from '../../src/main/core/cameras'
import type { PhotoFile } from '../../src/main/core/types'

const p = (name: string, extra: Partial<PhotoFile> = {}): PhotoFile => ({ path: `/x/${name}`, name, size: 1, ...extra })

describe('groupCameras', () => {
  test('groups by serial, then make+model, then filename prefix', () => {
    const bySerial = groupCameras([p('DSC1.jpg', { serial: 'X1' }), p('DSC2.jpg', { serial: 'X2' }), p('DSC3.jpg', { serial: 'X1' })])
    expect(bySerial).toHaveLength(2)
    expect(bySerial.find((c) => c.photos.length === 2)!.photos.map((x) => x.name)).toEqual(['DSC1.jpg', 'DSC3.jpg'])

    const byModel = groupCameras([p('DSC1.jpg', { make: 'SONY', model: 'A' }), p('DSC2.jpg', { make: 'SONY', model: 'B' })])
    expect(byModel).toHaveLength(2)

    const byPrefix = groupCameras([p('DSC01.jpg'), p('BHV02.jpg'), p('DSC03.jpg')])
    expect(byPrefix.map((c) => c.id).sort()).toEqual(['prefix:BHV', 'prefix:DSC'])
  })

  test('a lone metadata-bearing file joins its prefix group', () => {
    const cams = groupCameras([p('DSC03271.jpg'), p('DSC03272.jpg'), p('DSC03272-3.jpg', { model: 'ILME-FX3', captureMs: 5 })])
    expect(cams).toHaveLength(1)
    expect(cams[0].photos).toHaveLength(3)
  })

  test('camera label is model when known else prefix', () => {
    const cams = groupCameras([p('BHV1.jpg', { model: 'ILCE-7RM2' }), p('DSC1.jpg')])
    expect(cams.map((c) => c.label).sort()).toEqual(['DSC', 'ILCE-7RM2'])
  })

  test('orders by captureMs when every photo has it, else by file number', () => {
    const timed = groupCameras([p('A3.jpg', { captureMs: 1 }), p('A1.jpg', { captureMs: 3 }), p('A2.jpg', { captureMs: 2 })])
    expect(timed[0].photos.map((x) => x.name)).toEqual(['A3.jpg', 'A2.jpg', 'A1.jpg'])
    const mixed = groupCameras([p('A3.jpg', { captureMs: 1 }), p('A10.jpg'), p('A2.jpg', { captureMs: 2 })])
    expect(mixed[0].photos.map((x) => x.name)).toEqual(['A2.jpg', 'A3.jpg', 'A10.jpg'])
  })

  test('ties broken by file number then name', () => {
    const cams = groupCameras([p('A9.jpg', { captureMs: 1 }), p('A7.jpg', { captureMs: 1 }), p('A8.jpg', { captureMs: 1 })])
    expect(cams[0].photos.map((x) => x.name)).toEqual(['A7.jpg', 'A8.jpg', 'A9.jpg'])
  })

  test('timed is true only when all photos have captureMs', () => {
    expect(groupCameras([p('A1.jpg', { captureMs: 1 }), p('A2.jpg', { captureMs: 2 })])[0].timed).toBe(true)
    expect(groupCameras([p('A1.jpg', { captureMs: 1 }), p('A2.jpg')])[0].timed).toBe(false)
  })
})

describe('fileNumber', () => {
  test('parses duplicates', () => {
    expect(fileNumber('DSC03272-3.jpg')).toEqual([3272, 3])
    expect(fileNumber('DSC03272.jpg')).toEqual([3272])
    const cams = groupCameras([p('DSC03272-3.jpg'), p('DSC03272.jpg')])
    expect(cams[0].photos.map((x) => x.name)).toEqual(['DSC03272.jpg', 'DSC03272-3.jpg'])
  })
})
