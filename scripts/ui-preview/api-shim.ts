export * from '../../src/shared/api'
export function thumbUrl(path: string, _width: number): string {
  return `/thumbs/${path.split('/').pop()}`
}
