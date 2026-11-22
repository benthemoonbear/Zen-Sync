import { argmax } from './classify'

export const FLOAT_MIN_PROB = 0.5

/**
 * Assigns a part index to each photo in one camera's shooting order so that parts never go
 * backwards (a Viterbi pass over non-decreasing part sequences, cost = −log p). Photos whose
 * best part is a floating part (Details) with probability > 0.5 are exempt and keep that part;
 * other photos are only assigned non-floating parts.
 */
export function assignMonotonic(scores: number[][], floatingParts: boolean[]): number[] {
  const out = new Array<number>(scores.length)
  const seq: number[] = []
  scores.forEach((row, i) => {
    const best = argmax(row)
    if (floatingParts[best] && row[best] > FLOAT_MIN_PROB) out[i] = best
    else seq.push(i)
  })

  const allowed = floatingParts.map((f, j) => (f ? -1 : j)).filter((j) => j >= 0)
  if (!seq.length || !allowed.length) {
    for (const i of seq) out[i] = argmax(scores[i])
    return out
  }

  const K = allowed.length
  const cost = (i: number, k: number) => -Math.log(scores[i][allowed[k]] + 1e-9)
  let prev = Array.from({ length: K }, (_, k) => cost(seq[0], k))
  const back: number[][] = []
  for (let t = 1; t < seq.length; t++) {
    const cur = new Array<number>(K)
    const ptr = new Array<number>(K)
    let bestPrev = 0
    for (let k = 0; k < K; k++) {
      if (prev[k] < prev[bestPrev]) bestPrev = k
      cur[k] = prev[bestPrev] + cost(seq[t], k)
      ptr[k] = bestPrev
    }
    back.push(ptr)
    prev = cur
  }
  let k = prev.indexOf(Math.min(...prev))
  for (let t = seq.length - 1; t >= 0; t--) {
    out[seq[t]] = allowed[k]
    if (t > 0) k = back[t - 1][k]
  }
  return out
}
