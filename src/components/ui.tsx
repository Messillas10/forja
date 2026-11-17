import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmtClock, restTimer, useRestTimer } from '../lib/restTimer'
import { Icon } from './icons'

export function Sheet({ title, onClose, children, actions, fit }: {
  title: string
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
  fit?: boolean
}) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet${fit ? ' fit' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2 className="h2">{title}</h2>
          {actions}
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

/** Barra superior de subpáginas: volver + título opcional + acción. */
export function TopBar({ title, action, back }: { title?: string; action?: ReactNode; back?: string }) {
  const navigate = useNavigate()
  return (
    <div className="topbar">
      <button className="icon-btn" onClick={() => (back ? navigate(back) : navigate(-1))} aria-label="Volver"><Icon name="back" /></button>
      <div className="grow ellipsis">{title}</div>
      <div style={{ minWidth: 44, display: 'flex', justifyContent: 'flex-end' }}>{action}</div>
    </div>
  )
}

export function Figure({ value, label }: { value: ReactNode; label: string }) {
  return <div className="figure"><b>{value}</b><span>{label}</span></div>
}

export function RestBar() {
  const { active, remaining, total } = useRestTimer()
  if (!active) return null
  return (
    <div className="rest fade-in" role="timer" aria-live="off" aria-label={`Descanso: ${fmtClock(remaining)}`}>
      <div className="rest-bar" style={{ width: `${(remaining / total) * 100}%` }} />
      <div className="rest-inner">
        <button onClick={() => restTimer.add(-15)} aria-label="Quitar 15 segundos">−15</button>
        <div className="grow">
          <span className="rest-label">Descanso</span>
          <div className="rest-time">{fmtClock(remaining)}</div>
        </div>
        <button onClick={() => restTimer.add(15)} aria-label="Añadir 15 segundos">+15</button>
        <button onClick={() => restTimer.stop()} style={{ padding: '0 14px' }}>Saltar</button>
      </div>
    </div>
  )
}

/** Gráfica de línea mínima: trazo en tinta, último punto en ascua. */
export function LineChart({ points, unit = '', height = 150 }: { points: { x: number; y: number }[]; unit?: string; height?: number }) {
  if (points.length < 2) return <p className="small muted">Con dos sesiones o más verás aquí la evolución.</p>
  const W = 340
  const H = height
  const pad = { l: 34, r: 10, t: 12, b: 22 }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const span = y1 - y0 || Math.abs(y1) * 0.1 || 1
  y0 -= span * 0.15
  y1 += span * 0.15
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r)
  const sy = (y: number) => H - pad.b - ((y - y0) / (y1 - y0)) * (H - pad.t - pad.b)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
  const area = `${d} L${sx(x1).toFixed(1)},${H - pad.b} L${sx(x0).toFixed(1)},${H - pad.b} Z`
  const ticks = [y0 + (y1 - y0) * 0.15, (y0 + y1) / 2, y1 - (y1 - y0) * 0.15]
  const fmtDate = (t: number) => new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short' })
  const last = points[points.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Evolución: de ${fmtKg(points[0].y)} a ${fmtKg(last.y)} ${unit}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--rule)" />
          <text x={pad.l - 6} y={sy(t) + 4} fontSize="11" fill="var(--steel)" textAnchor="end" style={{ fontStretch: '80%' }}>{y1 - y0 < 10 ? fmtKg(t) : Math.round(t)}</text>
        </g>
      ))}
      <path d={area} fill="var(--ink)" opacity="0.06" />
      <path d={d} fill="none" stroke="var(--ink)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={i === points.length - 1 ? 5 : 3} fill={i === points.length - 1 ? 'var(--ember)' : 'var(--ink)'}>
          <title>{`${fmtDate(p.x)}: ${fmtKg(p.y)} ${unit}`}</title>
        </circle>
      ))}
      <text x={pad.l} y={H - 5} fontSize="11" fill="var(--steel)">{fmtDate(x0)}</text>
      <text x={W - pad.r} y={H - 5} fontSize="11" fill="var(--steel)" textAnchor="end">{fmtDate(x1)}</text>
    </svg>
  )
}

/** Primera letra en mayúscula («martes, 17 de noviembre» → «Martes, 17 de noviembre»). */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const fmtKg = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es')
