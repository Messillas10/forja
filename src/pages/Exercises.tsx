import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CustomExerciseForm, MuscleChips, useExerciseFilter } from '../components/ExercisePicker'
import { fmtKg, initials, LineChart } from '../components/ui'
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '../data/exercises'
import { db, exerciseHistory } from '../db'
import { e1rm, loadForTarget, RPE_VALUES, tonnage } from '../lib/formulas'
import { incrementFor, sessionE1rm, suggestNext, workingSets } from '../lib/progression'
import { roundTo } from '../lib/formulas'

export function ExerciseList() {
  const exercises = useLiveQuery(() => db.exercises.toArray())
  const { q, setQ, muscle, setMuscle, filtered } = useExerciseFilter(exercises)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  return (
    <div className="page">
      <div className="page-header">
        <h1>Ejercicios</h1>
        <button className="btn ghost small" onClick={() => setCreating(true)}>+ Crear</button>
      </div>
      <input className="input" placeholder={`Buscar entre ${exercises?.length ?? ''} ejercicios…`} value={q} onChange={(e) => setQ(e.target.value)} />
      <MuscleChips value={muscle} onChange={setMuscle} />
      <div>
        {filtered.map((e) => (
          <Link key={e.id} to={`/ejercicios/${e.id}`} className="list-item">
            <div className="avatar">{initials(e.name)}</div>
            <div className="grow">
              <div>{e.name}{e.custom && <span className="badge" style={{ marginLeft: 6 }}>propio</span>}</div>
              <small>{MUSCLE_LABEL[e.primary]}{e.secondary.length ? ` + ${e.secondary.map((m) => MUSCLE_LABEL[m]).join(', ')}` : ''} · {EQUIPMENT_LABEL[e.equipment]}</small>
            </div>
          </Link>
        ))}
      </div>
      {creating && <CustomExerciseForm initialName={q} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/ejercicios/${id}`)} />}
    </div>
  )
}

export function ExerciseDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ex = useLiveQuery(() => db.exercises.get(id!), [id])
  const history = useLiveQuery(() => exerciseHistory(id!, undefined, 200), [id])
  const workouts = useLiveQuery(() => db.workouts.toArray().then((l) => new Map(l.map((w) => [w.id!, w]))))
  const [reps, setReps] = useState(5)
  const [rpe, setRpe] = useState(8)

  if (!ex || !history || !workouts) return null
  const sessions = history.map((s) => ({ sets: workingSets(s), w: workouts.get(s[0]?.workoutId) })).filter((s) => s.sets.length && s.w)
  const points = sessions.map((s) => ({ x: s.w!.startedAt, y: sessionE1rm(s.sets) })).reverse()
  const best = sessions.flatMap((s) => s.sets)
  const bestE1rm = Math.max(0, ...best.map((s) => e1rm(s.weight ?? 0, s.reps ?? 0, s.rpe)))
  const heaviest = Math.max(0, ...best.map((s) => s.weight ?? 0))
  const maxReps = Math.max(0, ...best.map((s) => s.reps ?? 0))
  const bestVolume = Math.max(0, ...sessions.map((s) => tonnage(s.sets)))
  const suggestion = suggestNext(ex, history, { repMin: 8, repMax: 12 })
  const lastE1rm = points.length ? points[points.length - 1].y : 0
  const hasWeight = ex.type === 'weight_reps' || ex.type === 'weighted_bodyweight'

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn ghost small" onClick={() => navigate(-1)}>← Volver</button>
      </div>
      <div>
        <h1>{ex.name}</h1>
        <small>{MUSCLE_LABEL[ex.primary]}{ex.secondary.length ? ` + ${ex.secondary.map((m) => MUSCLE_LABEL[m]).join(', ')}` : ''} · {EQUIPMENT_LABEL[ex.equipment]}</small>
      </div>

      {sessions.length === 0 ? (
        <p className="empty">Todavía no has registrado este ejercicio.</p>
      ) : (
        <>
          <div className="stat-grid">
            {hasWeight && <div className="stat"><b>{fmtKg(bestE1rm)}</b><small>Mejor e1RM (kg)</small></div>}
            {hasWeight && <div className="stat"><b>{fmtKg(heaviest)}</b><small>Peso máximo (kg)</small></div>}
            <div className="stat"><b>{maxReps}</b><small>Máx. reps</small></div>
            {hasWeight && <div className="stat"><b>{fmtKg(bestVolume)}</b><small>Mejor volumen sesión</small></div>}
          </div>
          {hasWeight && (
            <div className="card">
              <h3>e1RM por sesión</h3>
              <LineChart points={points} unit="kg" />
              <p className="ref">e1RM según tabla RPE (Zourdos 2016 / Helms 2016); sin RPE se asume fallo.</p>
            </div>
          )}
          {suggestion && (
            <div className="card">
              <h3>Próxima sesión (rango 8–12)</h3>
              <div>{hasWeight && suggestion.weight ? `${fmtKg(suggestion.weight)} kg × ` : ''}{suggestion.reps} reps</div>
              <small>{suggestion.reason} En las rutinas puedes fijar tu propio rango y RPE objetivo.</small>
            </div>
          )}
          {hasWeight && lastE1rm > 0 && (
            <div className="card">
              <h3>Calculadora de cargas</h3>
              <small>A partir de tu último e1RM ({fmtKg(lastE1rm)} kg).</small>
              <div className="row wrap">
                <label className="row">Reps <select className="cell" value={reps} onChange={(e) => setReps(+e.target.value)}>{Array.from({ length: 12 }, (_, i) => i + 1).map((r) => <option key={r}>{r}</option>)}</select></label>
                <label className="row">RPE <select className="cell rpe" value={rpe} onChange={(e) => setRpe(+e.target.value)}>{RPE_VALUES.map((r) => <option key={r}>{r}</option>)}</select></label>
                <b style={{ fontSize: '1.3rem' }}>= {fmtKg(roundTo(loadForTarget(lastE1rm, reps, rpe), incrementFor(ex)))} kg</b>
              </div>
            </div>
          )}
          <div className="card">
            <h3>Sesiones</h3>
            <table className="plain">
              <thead><tr><th>Fecha</th><th>Mejor serie</th><th>{hasWeight ? 'e1RM' : 'Series'}</th></tr></thead>
              <tbody>
                {sessions.slice(0, 20).map((s) => {
                  const top = [...s.sets].sort((a, b) => e1rm(b.weight ?? 0, b.reps ?? 0, b.rpe) - e1rm(a.weight ?? 0, a.reps ?? 0, a.rpe))[0]
                  return (
                    <tr key={s.w!.id} onClick={() => navigate(`/historial/${s.w!.id}`)} style={{ cursor: 'pointer' }}>
                      <td>{new Date(s.w!.startedAt).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</td>
                      <td>{top.durationSec ? `${top.durationSec} s` : `${hasWeight ? `${fmtKg(top.weight ?? 0)}×` : ''}${top.reps}${top.rpe ? ` @${top.rpe}` : ''}`}</td>
                      <td>{hasWeight ? fmtKg(sessionE1rm(s.sets)) : s.sets.length}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <small className="muted">Incremento de carga: {incrementFor(ex)} kg</small>
      {ex.custom && (
        <button className="btn danger" onClick={async () => {
          if (confirm('¿Borrar este ejercicio personalizado? Su historial se mantiene pero quedará sin nombre.')) {
            await db.exercises.delete(ex.id)
            navigate('/ejercicios')
          }
        }}>Borrar ejercicio</button>
      )}
    </div>
  )
}
