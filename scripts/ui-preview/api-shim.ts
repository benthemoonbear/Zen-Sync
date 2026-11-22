export * from '../../src/shared/api'
export function thumbUrl(path: string, _width: number): string {
  const q = (globalThis as any).location?.search ?? ''
  const dir = q.includes('robyn') ? 'thumbs-robyn' : q.includes('demo') ? 'thumbs-demo' : 'thumbs'
  return `/${dir}/${path.split('/').pop()}`
}
