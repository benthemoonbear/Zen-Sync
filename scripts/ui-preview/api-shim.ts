export * from '../../src/shared/api'
export function thumbUrl(path: string, _width: number): string {
  return `/${(globalThis as any).location?.search.includes('demo') ? 'thumbs-demo' : 'thumbs'}/${path.split('/').pop()}`
}
