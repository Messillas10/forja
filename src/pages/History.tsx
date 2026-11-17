import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fmtKg } from '../components/ui'
import { db, deleteWorkout } from '../db'
import { e1rm, tonnage } from '../lib/formulas'
import type { Exercise, WorkoutSet } from '../types'

const fmtDate = (t: number) => new Date(t).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
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
  return (
    <div className="page">
      <h1>Historial</h1>
      {data.length === 0 && <p className="empty">Aún no has terminado ningún entrenamiento.</p>}
      {data.map(({ w, sets, groups, exercises }) => (
        <Link key={w.id} to={`/historial/${w.id}`} className="card link">
          <div className="row between">
            <b>{w.name}</b>
            <small>{fmtDate(w.startedAt)}</small>
          </div>
          <div className="row muted" style={{ gap: 16, fontSize: '0.85rem' }}>
            <span>⏱ {fmtDur(w.endedAt! - w.startedAt)}</span>
            <span>{fmtKg(tonnage(sets))} kg</span>
            <span>{sets.length} series</span>
          </div>
          <div style={{ fontSize: '0.9rem' }}>
            {groups.slice(0, 5).map((g) => (
              <div key={g[0].exerciseOrder} className="muted">{g.length} × {exercises.get(g[0].exerciseId)?.name}</div>
            ))}
            {groups.length > 5 && <div className="muted">y {groups.length - 5} más…</div>}
          </div>
        </Link>
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
    // Récords: mejor e1RM de este entreno frente al mejor de todos los entrenos anteriores.
    const prs = new Map<string, number>()
    for (const exId of new Set(sets.map((s) => s.exerciseId))) {
      const all = await db.sets.where('exerciseId').equals(exId).toArray()
      const earlier = await db.workouts.bulkGet([...new Set(all.map((s) => s.workoutId))])
      const earlierIds = new Set(earlier.filter((x) => x && x.endedAt && x.startedAt < w.startedAt).map((x) => x!.id))
      const best = (list: WorkoutSet[]) => Math.max(0, ...list.filter((s) => s.done && s.kind !== 'warmup').map((s) => e1rm(s.weight ?? 0, s.reps ?? 0, s.rpe)))
      const before = best(all.filter((s) => earlierIds.has(s.workoutId)))
      const now = best(sets.filter((s) => s.exerciseId === exId))
      if (now > before && before > 0) prs.set(exId, now)
    }
    return { w, sets, exercises, prs }
  }, [id])

  if (data === undefined) return null
  if (data === null) return <div className="page"><p className="empty">Entrenamiento no encontrado.</p></div>
  const { w, sets, exercises, prs } = data
  const work = sets.filter((s) => s.kind !== 'warmup')
  const minutes = w.endedAt ? (w.endedAt - w.startedAt) / 60000 : 0

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn ghost small" onClick={() => navigate('/historial')}>← Historial</button>
      </div>
      <div>
        <h1>{w.name}</h1>
        <small>{fmtDate(w.startedAt)}</small>
      </div>
      <div className="stat-grid">
        <div className="stat"><b>{fmtDur(minutes * 60000)}</b><small>Duración</small></div>
        <div className="stat"><b>{fmtKg(tonnage(work))}</b><small>Volumen (kg)</small></div>
        <div className="stat"><b>{work.length}</b><small>Series</small></div>
        {w.sessionRpe && <div className="stat"><b>{Math.round(w.sessionRpe * minutes)}</b><small>Carga sRPE (UA)</small></div>}
      </div>
      {prs.size > 0 && (
        <div className="card" style={{ border: '1px solid var(--ok)' }}>
          <b>🏆 Nuevos récords (e1RM)</b>
          {[...prs].map(([exId, v]) => <div key={exId}>{exercises.get(exId)?.name}: <b>{fmtKg(v)} kg</b></div>)}
        </div>
      )}
      {groupByExercise(sets).map((g) => {
        const ex = exercises.get(g[0].exerciseId) as Exercise | undefined
        let n = 0
        return (
          <div key={g[0].exerciseOrder} className="card">
            <Link to={`/ejercicios/${g[0].exerciseId}`} className="ex-title">{ex?.name}</Link>
            <table className="plain">
              <thead><tr><th>Serie</th><th>Carga</th><th>RPE</th><th>e1RM</th></tr></thead>
              <tbody>
                {g.map((s) => (
                  <tr key={s.id}>
                    <td>{s.kind === 'warmup' ? 'C' : s.kind === 'drop' ? 'D' : s.kind === 'failure' ? 'F' : ++n}</td>
                    <td>{s.durationSec ? `${s.durationSec} s` : `${s.weight ? `${fmtKg(s.weight)} kg × ` : ''}${s.reps ?? 0}`}</td>
                    <td>{s.rpe ?? '–'}</td>
                    <td>{s.weight && s.reps && s.kind !== 'warmup' ? fmtKg(e1rm(s.weight, s.reps, s.rpe)) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
      <button
        className="btn danger block"
        onClick={async () => {
          if (confirm('¿Borrar este entrenamiento del historial?')) {
            await deleteWorkout(w.id!)
            navigate('/historial')
          }
        }}
      >
        Borrar entrenamiento
      </button>
    </div>
  )
}
