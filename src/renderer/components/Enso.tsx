// The Zen Sync ensō: master geometry from the logo kit (zen-sync-symbol.svg, 256×256).
const BAND = 'M216.09 98.48 A98 98 0 1 1 120.58 34.06 L133.49 50.04 A72 72 0 1 0 203.66 97.37 Z'
const DOT = { cx: 171.53, cy: 61.53, r: 15 }
const GOLD = '#F3E3C3'
const GOLD_DEEP = '#E9C98E'
const DOT_LIGHT = '#FFF4DE'

export function EnsoLogo({ size = 96 }: { size?: number }) {
  return (
    <svg data-testid="enso-logo" role="img" aria-label="Zen Sync" width={size} height={size} viewBox="0 0 256 256" className="enso-glow">
      <path d={BAND} fill={GOLD} />
      <circle cx={DOT.cx} cy={DOT.cy} r={DOT.r} fill={DOT_LIGHT} />
    </svg>
  )
}

/** Liquid-fill loader: gold rises through the ensō with progress (0–1); the dot lights up when complete. */
export function EnsoLoader({ progress, complete, size = 150 }: { progress: number; complete: boolean; size?: number }) {
  const p = Math.max(0, Math.min(1, progress))
  const level = 232 - p * 204
  return (
    <svg
      data-testid="enso-loader"
      data-progress={String(Math.round(p * 1000) / 1000)}
      data-complete={String(complete)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      width={size}
      height={size}
      viewBox="0 0 256 256"
      className="enso-glow"
    >
      <defs>
        <clipPath id="enso-clip">
          <path d={BAND} />
        </clipPath>
        <linearGradient id="enso-liquid" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={GOLD} />
          <stop offset="1" stopColor={GOLD_DEEP} />
        </linearGradient>
      </defs>
      <path d={BAND} fill="#2a2724" />
      <g clipPath="url(#enso-clip)">
        <g className="enso-level" style={{ transform: `translateY(${level}px)` }}>
          <path
            className="enso-wave"
            fill="url(#enso-liquid)"
            d="M0 0 Q20 -12 40 0 T80 0 T120 0 T160 0 T200 0 T240 0 T280 0 T320 0 T360 0 T400 0 T440 0 T480 0 V260 H0 Z"
          />
        </g>
      </g>
      <circle className={`enso-dot${complete ? ' lit' : ''}`} cx={DOT.cx} cy={DOT.cy} r={DOT.r} fill={DOT_LIGHT} />
    </svg>
  )
}
