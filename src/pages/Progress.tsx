import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Figure, fmtKg, LineChart } from '../components/ui'
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
    return { workouts, sets, exercises, now: Date.now() }
  })
  if (!data) return null
  const { workouts, sets, exercises, now } = data
  const wById = new Map(workouts.map((w) => [w.id!, w]))

  // Series efectivas de los últimos 7 días por músculo (cómputo fraccional).
  const muscleSets = new Map<Muscle, number>()
  for (const s of sets) {
    const w = wById.get(s.workoutId)
    if (!w || w.startedAt < now - 7 * DAY) continue
    const ex = exercises.get(s.exerciseId)
    if (!ex) continue
    muscleSets.set(ex.primary, (muscleSets.get(ex.primary) ?? 0) + 1)
    for (const m of ex.secondary) muscleSets.set(m, (muscleSets.get(m) ?? 0) + SECONDARY_MUSCLE_FACTOR)
  }
  const muscles = (Object.keys(MUSCLE_LABEL) as Muscle[]).map((m) => [m, muscleSets.get(m) ?? 0] as const).sort((a, b) => b[1] - a[1])

  // Volumen semanal (12 semanas).
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

  // Carga aguda:crónica con carga sRPE diaria.
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
  const max = 24

  return (
    <div className="page">
      <h1 className="display title">Progreso</h1>
      <div className="figures">
        <Figure value={(last28 / 4).toLocaleString('es', { maximumFractionDigits: 1 })} label="Entrenos por semana" />
        <Figure value={fmtKg(weeklyTonnage[11].y)} label="kg esta semana" />
        <Figure value={workouts.length} label="Entrenos en total" />
      </div>

      <BodyWeightCard />

      <section className="section">
        <div className="section-head">
          <h2 className="h2">Series por músculo</h2>
          <span className="small muted">Últimos 7 días</span>
        </div>
        <p className="small muted">La zona verde es lo recomendado para ganar músculo: entre {WEEKLY_SETS_TARGET.min} y {WEEKLY_SETS_TARGET.max} series a la semana.</p>
        <div className="block" style={{ gap: 14 }}>
          {muscles.map(([m, v]) => {
            const cls = v >= WEEKLY_SETS_TARGET.min && v <= WEEKLY_SETS_TARGET.max ? 'ok' : v > WEEKLY_SETS_TARGET.max ? 'over' : ''
            return (
              <div key={m} className="stack" style={{ gap: 5 }}>
                <div className="row between small">
                  <span style={{ fontWeight: 550 }}>{MUSCLE_LABEL[m]}</span>
                  <span className="num" style={{ fontSize: '1.05rem', color: v ? 'var(--ink)' : 'var(--steel)' }}>{v.toLocaleString('es', { maximumFractionDigits: 1 })}</span>
                </div>
                <div className="meter" role="img" aria-label={`${MUSCLE_LABEL[m]}: ${v} series`}>
                  <div className="zone" style={{ left: `${(WEEKLY_SETS_TARGET.min / max) * 100}%`, width: `${((WEEKLY_SETS_TARGET.max - WEEKLY_SETS_TARGET.min) / max) * 100}%` }} />
                  <div className={`fill ${cls}`} style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
                </div>
              </div>
            )
          })}
        </div>
        <p className="ref">Un ejercicio cuenta como serie entera para su músculo principal y como media para los secundarios. Schoenfeld, Ogborn y Krieger (2017); Pelland et al. (2024).</p>
      </section>

      <section className="section">
        <h2 className="h2">Volumen semanal</h2>
        <LineChart points={tonnagePoints} unit="kg" />
      </section>

      <section className="section">
        <h2 className="h2">Carga de entrenamiento</h2>
        {acwr?.ratio != null ? (
          <div className="block">
            <div className="row" style={{ gap: 16, alignItems: 'center' }}>
              <span className="num" style={{ fontSize: '2.75rem', lineHeight: 1, color: acwr.ratio > 1.5 ? 'var(--danger)' : acwr.ratio > 1.3 || acwr.ratio < 0.8 ? 'var(--warn)' : 'var(--done)' }}>
                {acwr.ratio.toFixed(2).replace('.', ',')}
              </span>
              <p className="small">
                {acwr.ratio > 1.5 ? 'Has subido la carga muy deprisa. Considera aflojar esta semana.' : acwr.ratio > 1.3 ? 'La carga está subiendo rápido.' : acwr.ratio < 0.8 ? 'Entrenas menos que de costumbre: descarga, descanso o semana floja.' : 'Carga estable respecto a tus últimas semanas.'}
              </p>
            </div>
          </div>
        ) : (
          <p className="small muted">Compara tu última semana con tu media del mes. Aparece tras 3 semanas puntuando el esfuerzo al terminar cada entreno.</p>
        )}
        <p className="ref">Carga = esfuerzo (1–10) × minutos (Foster et al., 2001), con medias de 7 y 28 días (Williams et al., 2017). Úsalo como tendencia: no predice lesiones de forma fiable (Impellizzeri et al., 2020).</p>
      </section>
    </div>
  )
}

/** Peso corporal: cuenta la media semanal, no el pesaje suelto (fluctúa 1–2 kg por agua y glucógeno). */
function BodyWeightCard() {
  const weights = useLiveQuery(() => db.bodyweights.orderBy('date').toArray())
  const [kg, setKg] = useState('')
  const [now] = useState(() => Date.now())
  if (!weights) return null
  const normal = weights.filter((w) => !w.cond || w.cond === 'normal')
  const avg = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null)
  const thisWeek = avg(normal.filter((w) => w.date > now - 7 * DAY).map((w) => w.kg))
  const prevWeek = avg(normal.filter((w) => w.date <= now - 7 * DAY && w.date > now - 14 * DAY).map((w) => w.kg))
  const weekly = new Map<number, number[]>()
  for (const w of normal) {
    const wk = startOfWeek(w.date)
    weekly.set(wk, [...(weekly.get(wk) ?? []), w.kg])
  }
  const points = [...weekly.entries()].sort((a, b) => a[0] - b[0]).map(([x, l]) => ({ x, y: avg(l)! }))
  const delta = thisWeek != null && prevWeek != null ? thisWeek - prevWeek : null

  async function save() {
    const v = Number(kg.replace(',', '.'))
    if (!v || v < 25 || v > 300) return
    await db.bodyweights.add({ date: Date.now(), kg: v })
    setKg('')
  }

  return (
    <section className="section">
      <h2 className="h2">Peso corporal</h2>
      <div className="block">
        <form className="row" onSubmit={(e) => { e.preventDefault(); save() }}>
          <input className="field grow num" style={{ fontSize: '1.25rem' }} inputMode="decimal" placeholder="Peso de hoy, kg" value={kg} onChange={(e) => setKg(e.target.value)} aria-label="Peso de hoy en kg" />
          <button className="btn ink" disabled={!kg}>Guardar</button>
        </form>
        {thisWeek != null ? (
          <div className="figures">
            <Figure value={fmtKg(thisWeek)} label="Media de 7 días (kg)" />
            {delta != null && <Figure value={`${delta >= 0 ? '+' : '−'}${fmtKg(Math.abs(delta))}`} label="Frente a la semana anterior" />}
          </div>
        ) : (
          <p className="small muted">Pésate en la báscula del gimnasio antes de entrenar, siempre en las mismas condiciones. Al empezar un entreno, Forja te lo pregunta. Lo que cuenta es la media de la semana.</p>
        )}
        {points.length >= 2 && <LineChart points={points} unit="kg" height={120} />}
        {weights.length > 0 && (
          <details>
            <summary>Registros ({weights.length})</summary>
            {[...weights].reverse().slice(0, 30).map((w) => (
              <div key={w.id} className="row between small" style={{ padding: '4px 0' }}>
                <span>{new Date(w.date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}, <b className="num" style={{ fontSize: '1rem' }}>{fmtKg(w.kg)}</b> kg{w.cond === 'ayunas' ? ' · en ayunas' : w.cond === 'comido' ? ' · recién comido' : ''}</span>
                <button className="btn danger sm" onClick={() => db.bodyweights.delete(w.id!)}>Borrar</button>
              </div>
            ))}
          </details>
        )}
      </div>
    </section>
  )
}
