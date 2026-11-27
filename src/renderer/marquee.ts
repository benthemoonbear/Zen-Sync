export interface Box { left: number; top: number; right: number; bottom: number }

/** The rectangle between where a drag started and where the pointer is now. */
export function boxFrom(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) }
}

/** Paths of the tiles a selection box touches, in the order given. */
export function pathsInBox(box: Box, tiles: { path: string; rect: Box }[]): string[] {
  return tiles
    .filter(({ rect }) => rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top)
    .map((t) => t.path)
}
