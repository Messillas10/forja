import { useEffect, type ReactNode } from 'react'
import { fmtClock, restTimer, useRestTimer } from '../lib/restTimer'

export function Sheet({ title, onClose, children, actions, auto }: {
  title: string
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
  auto?: boolean
}) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet${auto ? ' auto' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-head">
          <button className="btn ghost small" onClick={onClose}>Cerrar</button>
          <h2 className="grow" style={{ textAlign: 'center' }}>{title}</h2>
          <div style={{ minWidth: 64, display: 'flex', justifyContent: 'flex-end' }}>{actions}</div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

export function RestBar() {
  const { active, remaining, total } = useRestTimer()
  if (!active) return null
  return (
    <div className="rest" role="timer" aria-live="polite">
      <button onClick={() => restTimer.add(-15)}>−15</button>
      <div className="time">{fmtClock(remaining)}</div>
      <button onClick={() => restTimer.add(15)}>+15</button>
      <button onClick={() => restTimer.stop()}>Saltar</button>
      <div className="bar" style={{ width: `${(remaining / total) * 100}%` }} />
    </div>
  )
}

/** Gráfica de líneas SVG mínima, sin dependencias. */
export function LineChart({ points, unit = '', height = 160 }: { points: { x: number; y: number; label?: string }[]; unit?: string; height?: number }) {
  if (points.length < 2) return <p className="muted" style={{ fontSize: '0.85rem' }}>Necesitas al menos 2 sesiones para ver la evolución.</p>
  const W = 320
  const H = height
  const pad = { l: 36, r: 8, t: 10, b: 20 }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const span = y1 - y0 || y1 * 0.1 || 1
  y0 -= span * 0.1
  y1 += span * 0.1
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r)
  const sy = (y: number) => H - pad.b - ((y - y0) / (y1 - y0)) * (H - pad.t - pad.b)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
  const ticks = [y0 + (y1 - y0) * 0.1, (y0 + y1) / 2, y1 - (y1 - y0) * 0.1]
  const fmtDate = (t: number) => new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short' })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Evolución">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--border)" strokeDasharray="3 4" />
          <text x={pad.l - 4} y={sy(t) + 4} fontSize="10" fill="var(--text-2)" textAnchor="end">{Math.round(t)}</text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p) => (
        <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r="3.5" fill="var(--accent)">
          <title>{`${p.label ?? fmtDate(p.x)}: ${p.y.toFixed(1)} ${unit}`}</title>
        </circle>
      ))}
      <text x={pad.l} y={H - 4} fontSize="10" fill="var(--text-2)">{fmtDate(x0)}</text>
      <text x={W - pad.r} y={H - 4} fontSize="10" fill="var(--text-2)" textAnchor="end">{fmtDate(x1)}</text>
    </svg>
  )
}

export const fmtKg = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es')

export function initials(name: string) {
  return name.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}
