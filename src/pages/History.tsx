import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/icons'
import { cap, Figure, fmtKg, TopBar } from '../components/ui'
import { db, deleteWorkout } from '../db'
import { e1rm, tonnage } from '../lib/formulas'
import type { Exercise, WorkoutSet } from '../types'

const fmtDur = (ms: number) => {
  const m = Math.round(ms / 60000)
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}

function groupByExercise(sets: WorkoutSet[]) {
  const map = new Map<number, WorkoutSet[]>()
  for (const s of [...sets].sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setIndex - b.setIndex)) {
    map.set(s.exerciseOrder, [...(map.get(s.exerciseOrder) ?? []), s])
  }
  return [...map.values()]
}

export function HistoryList() {
  const data = useLiveQuery(async () => {
    const workouts = (await db.workouts.orderBy('startedAt').reverse().toArray()).filter((w) => w.endedAt)
    const sets = await db.sets.toArray()
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
    return workouts.map((w) => {
      const ws = sets.filter((s) => s.workoutId === w.id && s.kind !== 'warmup')
      return { w, sets: ws, groups: groupByExercise(ws), exercises }
    })
  })
  if (!data) return null

  // Agrupar por mes para orientarse en el historial.
  const months = new Map<string, typeof data>()
  for (const item of data) {
    const key = cap(new Date(item.w.startedAt).toLocaleDateString('es', { month: 'long', year: 'numeric' }))
    months.set(key, [...(months.get(key) ?? []), item])
  }

  return (
    <div className="page">
      <h1 className="display title">Historial</h1>
      {data.length === 0 && (
        <div className="empty">
          <p>Aquí aparecerá cada entreno que termines, con sus series y récords.</p>
          <Link to="/" className="btn primary">Empezar a entrenar</Link>
        </div>
      )}
      {[...months].map(([month, items]) => (
        <section key={month} className="section">
          <h2 className="h2">{month}</h2>
          <div className="list">
            {items.map(({ w, sets, groups, exercises }) => {
              const date = new Date(w.startedAt)
              return (
                <Link key={w.id} to={`/historial/${w.id}`} className="list-row" style={{ alignItems: 'flex-start', paddingTop: 14, paddingBottom: 14 }}>
                  <div style={{ width: 52, textAlign: 'center', flexShrink: 0 }}>
                    <div className="num" style={{ fontSize: '1.75rem', lineHeight: 1 }}>{date.getDate()}</div>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>{date.toLocaleDateString('es', { weekday: 'long' })}</div>
                  </div>
                  <div className="grow stack" style={{ gap: 4 }}>
                    <div style={{ fontWeight: 650 }}>{w.name}</div>
                    <div className="tiny muted">{fmtDur(w.endedAt! - w.startedAt)}, {fmtKg(tonnage(sets))} kg, {sets.length} series</div>
                    <div className="tiny ellipsis" style={{ color: 'var(--steel)' }}>
                      {groups.map((g) => exercises.get(g[0].exerciseId)?.name).join(', ')}
                    </div>
                  </div>
                  <Icon name="chev" className="chev" />
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

export function WorkoutDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const data = useLiveQuery(async () => {
    const w = await db.workouts.get(Number(id))
    if (!w) return null
    const sets = await db.sets.where('workoutId').equals(w.id!).toArray()
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
    // Récords: mejor e1RM de este entreno frente al mejor de todos los anteriores.
    const prs = new Map<string, { now: number; before: number }>()
    for (const exId of new Set(sets.map((s) => s.exerciseId))) {
      const all = await db.sets.where('exerciseId').equals(exId).toArray()
      const earlier = await db.workouts.bulkGet([...new Set(all.map((s) => s.workoutId))])
      const earlierIds = new Set(earlier.filter((x) => x && x.endedAt && x.startedAt < w.startedAt).map((x) => x!.id))
      const best = (list: WorkoutSet[]) => Math.max(0, ...list.filter((s) => s.done && s.kind !== 'warmup').map((s) => e1rm(s.weight ?? 0, s.reps ?? 0, s.rpe)))
      const before = best(all.filter((s) => earlierIds.has(s.workoutId)))
      const now = best(sets.filter((s) => s.exerciseId === exId))
      if (now > before && before > 0) prs.set(exId, { now, before })
    }
    return { w, sets, exercises, prs }
  }, [id])

  if (data === undefined) return null
  if (data === null) return <div className="page"><TopBar back="/historial" /><p className="muted">Este entreno ya no existe.</p></div>
  const { w, sets, exercises, prs } = data
  const work = sets.filter((s) => s.kind !== 'warmup')
  const minutes = w.endedAt ? (w.endedAt - w.startedAt) / 60000 : 0

  return (
    <div className="page" style={{ paddingTop: 8 }}>
      <div>
        <TopBar back="/historial" />
        <p className="small muted">{cap(new Date(w.startedAt).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
        <h1 className="display title">{w.name}</h1>
      </div>
      <div className="figures">
        <Figure value={`${Math.round(minutes)}′`} label="Duración" />
        <Figure value={fmtKg(tonnage(work))} label="kg movidos" />
        <Figure value={work.length} label="Series" />
        {w.sessionRpe ? <Figure value={w.sessionRpe} label="Esfuerzo (1–10)" /> : null}
      </div>
      {prs.size > 0 && (
        <div className="callout">
          <div className="row" style={{ fontWeight: 700, color: 'var(--done)' }}><Icon name="trophy" />{prs.size === 1 ? 'Nuevo récord' : `${prs.size} récords nuevos`}</div>
          {[...prs].map(([exId, v]) => (
            <div key={exId} className="row between small">
              <span>{exercises.get(exId)?.name}</span>
              <span className="num" style={{ fontSize: '1.05rem' }}>{fmtKg(v.before)} → {fmtKg(v.now)} kg</span>
            </div>
          ))}
          <p className="tiny muted">Máximo estimado a una repetición (e1RM).</p>
        </div>
      )}
      {groupByExercise(sets).map((g) => {
        const ex = exercises.get(g[0].exerciseId) as Exercise | undefined
        const hasW = ex?.type === 'weight_reps' || ex?.type === 'weighted_bodyweight'
        let n = 0
        return (
          <section key={g[0].exerciseOrder} className="section">
            <Link to={`/ejercicios/${g[0].exerciseId}`} className="row between">
              <h2 className="h2">{ex?.name ?? 'Ejercicio borrado'}</h2>
              <Icon name="chev" className="chev" />
            </Link>
            <table className="data">
              <thead><tr><th>Serie</th><th>{hasW ? 'kg × reps' : 'Reps'}</th><th>RPE</th>{hasW && <th>e1RM</th>}</tr></thead>
              <tbody>
                {g.map((s) => (
                  <tr key={s.id}>
                    <td className={s.kind === 'warmup' ? 'muted' : undefined}>{s.kind === 'warmup' ? 'Calent.' : s.kind === 'drop' ? 'Drop' : s.kind === 'failure' ? 'Fallo' : ++n}</td>
                    <td className="strong">{s.durationSec ? `${s.durationSec} s` : `${hasW ? `${fmtKg(s.weight ?? 0)} × ` : ''}${s.reps ?? 0}`}</td>
                    <td>{s.rpe ? String(s.rpe).replace('.', ',') : '–'}</td>
                    {hasW && <td>{s.weight && s.reps && s.kind !== 'warmup' ? fmtKg(e1rm(s.weight, s.reps, s.rpe)) : '–'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
      <button
        className="btn danger"
        onClick={async () => {
          if (confirm('¿Borrar este entreno del historial? No se puede deshacer.')) {
            await deleteWorkout(w.id!)
            navigate('/historial')
          }
        }}
      >
        Borrar entreno
      </button>
    </div>
  )
}
