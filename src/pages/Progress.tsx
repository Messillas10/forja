import { useLiveQuery } from 'dexie-react-hooks'
import { fmtKg, LineChart } from '../components/ui'
import { MUSCLE_LABEL } from '../data/exercises'
import { db } from '../db'
import { acwrEwma, SECONDARY_MUSCLE_FACTOR, sessionLoad, tonnage, WEEKLY_SETS_TARGET } from '../lib/formulas'
import type { Muscle } from '../types'

const DAY = 86400000
const startOfDay = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const startOfWeek = (t: number) => {
  const d = new Date(startOfDay(t))
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // lunes
  return d.getTime()
}

export default function Progress() {
  const data = useLiveQuery(async () => {
    const workouts = (await db.workouts.toArray()).filter((w) => w.endedAt)
    const sets = (await db.sets.toArray()).filter((s) => s.done && s.kind !== 'warmup')
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
    return { workouts, sets, exercises }
  })
  if (!data) return null
  const { workouts, sets, exercises } = data
  const now = Date.now()
  const wById = new Map(workouts.map((w) => [w.id!, w]))

  // Series efectivas en los últimos 7 días por músculo (cómputo fraccional).
  const weekAgo = now - 7 * DAY
  const muscleSets = new Map<Muscle, number>()
  for (const s of sets) {
    const w = wById.get(s.workoutId)
    if (!w || w.startedAt < weekAgo) continue
    const ex = exercises.get(s.exerciseId)
    if (!ex) continue
    muscleSets.set(ex.primary, (muscleSets.get(ex.primary) ?? 0) + 1)
    for (const m of ex.secondary) muscleSets.set(m, (muscleSets.get(m) ?? 0) + SECONDARY_MUSCLE_FACTOR)
  }

  // Tonelaje semanal (12 semanas).
  const thisWeek = startOfWeek(now)
  const weeks = Array.from({ length: 12 }, (_, i) => thisWeek - (11 - i) * 7 * DAY)
  const weeklyTonnage = weeks.map((wk) => ({
    x: wk,
    y: tonnage(sets.filter((s) => {
      const w = wById.get(s.workoutId)
      return w && w.startedAt >= wk && w.startedAt < wk + 7 * DAY
    })),
  }))
  const firstWorkout = Math.min(...workouts.map((w) => w.startedAt))
  const tonnagePoints = weeklyTonnage.filter((p) => p.x + 7 * DAY > firstWorkout)

  // ACWR con carga sRPE diaria (requiere RPE de sesión).
  const withRpe = workouts.filter((w) => w.sessionRpe)
  let acwr: ReturnType<typeof acwrEwma> | null = null
  if (withRpe.length) {
    const first = startOfDay(Math.min(...withRpe.map((w) => w.startedAt)))
    const days = Math.floor((startOfDay(now) - first) / DAY) + 1
    const loads = Array(days).fill(0)
    for (const w of withRpe) loads[Math.floor((startOfDay(w.startedAt) - first) / DAY)] += sessionLoad(w.sessionRpe!, (w.endedAt! - w.startedAt) / 60000)
    if (days >= 21) acwr = acwrEwma(loads)
  }

  const last28 = workouts.filter((w) => w.startedAt > now - 28 * DAY).length

  return (
    <div className="page">
      <h1>Progreso</h1>
      <div className="stat-grid">
        <div className="stat"><b>{workouts.length}</b><small>Entrenos totales</small></div>
        <div className="stat"><b>{(last28 / 4).toFixed(1)}</b><small>Entrenos/semana (últ. 4)</small></div>
        <div className="stat"><b>{fmtKg(weeklyTonnage[11].y)}</b><small>kg esta semana</small></div>
      </div>

      <div className="card">
        <h3>Series semanales por músculo</h3>
        <small>Últimos 7 días. Zona verde: {WEEKLY_SETS_TARGET.min}–{WEEKLY_SETS_TARGET.max} series. Músculo secundario cuenta ×{SECONDARY_MUSCLE_FACTOR}.</small>
        {(Object.keys(MUSCLE_LABEL) as Muscle[]).map((m) => {
          const v = muscleSets.get(m) ?? 0
          const max = 25
          const color = v >= WEEKLY_SETS_TARGET.min && v <= WEEKLY_SETS_TARGET.max ? 'var(--ok)' : v > WEEKLY_SETS_TARGET.max ? 'var(--warn)' : 'var(--accent)'
          return (
            <div key={m} className="stack" style={{ gap: 4 }}>
              <div className="row between" style={{ fontSize: '0.85rem' }}>
                <span>{MUSCLE_LABEL[m]}</span>
                <span className="muted">{v % 1 ? v.toFixed(1) : v}</span>
              </div>
              <div className="meter">
                <div className="zone" style={{ left: `${(WEEKLY_SETS_TARGET.min / max) * 100}%`, width: `${((WEEKLY_SETS_TARGET.max - WEEKLY_SETS_TARGET.min) / max) * 100}%` }} />
                <span style={{ width: `${Math.min(100, (v / max) * 100)}%`, background: color }} />
              </div>
            </div>
          )
        })}
        <p className="ref">Schoenfeld, Ogborn & Krieger (2017), J Sports Sci 35(11): relación dosis-respuesta, ≥10 series/sem. Pelland et al. (2024): rendimientos decrecientes y conteo fraccional.</p>
      </div>

      <div className="card">
        <h3>Volumen semanal (kg)</h3>
        <LineChart points={tonnagePoints} unit="kg" />
      </div>

      <div className="card">
        <h3>Carga aguda : crónica</h3>
        {acwr?.ratio != null ? (
          <>
            <div className="row" style={{ gap: 16 }}>
              <b style={{ fontSize: '2rem', color: acwr.ratio > 1.5 ? 'var(--danger)' : acwr.ratio > 1.3 || acwr.ratio < 0.8 ? 'var(--warn)' : 'var(--ok)' }}>{acwr.ratio.toFixed(2)}</b>
              <small>
                {acwr.ratio > 1.5 ? 'Pico de carga: considera bajar volumen esta semana.' : acwr.ratio > 1.3 ? 'Carga subiendo rápido.' : acwr.ratio < 0.8 ? 'Carga por debajo de tu habitual (¿descarga o desentreno?).' : 'Carga estable respecto a tu base.'}
              </small>
            </div>
          </>
        ) : (
          <small>Necesitas al menos 3 semanas de entrenos con RPE de sesión (se pide al terminar).</small>
        )}
        <p className="ref">Carga = RPE sesión × minutos (Foster et al., 2001). Medias exponenciales 7/28 días (Williams et al., 2017). Indicador orientativo: su capacidad para predecir lesiones está discutida (Impellizzeri et al., 2020).</p>
      </div>
    </div>
  )
}
