import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CustomExerciseForm, exerciseMeta, MuscleChips, useExerciseFilter } from '../components/ExercisePicker'
import { Icon } from '../components/icons'
import { Figure, fmtKg, LineChart, TopBar } from '../components/ui'
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '../data/exercises'
import { db, exerciseHistory } from '../db'
import { e1rm, loadForTarget, roundTo, RPE_VALUES, tonnage } from '../lib/formulas'
import { incrementFor, sessionE1rm, workingSets } from '../lib/progression'

export function ExerciseList() {
  const exercises = useLiveQuery(() => db.exercises.toArray())
  const { q, setQ, muscle, setMuscle, filtered } = useExerciseFilter(exercises)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  return (
    <div className="page">
      <div className="section-head">
        <h1 className="display title">Ejercicios</h1>
        <button className="btn quiet sm" onClick={() => setCreating(true)}><Icon name="plus" />Crear</button>
      </div>
      <div className="section">
        <input className="field search" type="search" placeholder={`Buscar entre ${exercises?.length ?? ''} ejercicios`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ejercicio" />
        <MuscleChips value={muscle} onChange={setMuscle} />
      </div>
      <div className="list">
        {filtered.map((e) => (
          <Link key={e.id} to={`/ejercicios/${e.id}`} className="list-row">
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{e.name}{e.custom && <span className="tag" style={{ marginLeft: 8 }}>Tuyo</span>}</div>
              <div className="tiny muted">{exerciseMeta(e)}</div>
            </div>
            <Icon name="chev" className="chev" />
          </Link>
        ))}
        {filtered.length === 0 && <div className="list-row muted">Ningún ejercicio coincide con la búsqueda.</div>}
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
  const [reps, setReps] = useState(8)
  const [rpe, setRpe] = useState(8.5)

  if (!ex || !history || !workouts) return null
  const sessions = history.map((s) => ({ sets: workingSets(s), w: workouts.get(s[0]?.workoutId) })).filter((s) => s.sets.length && s.w)
  const points = sessions.map((s) => ({ x: s.w!.startedAt, y: sessionE1rm(s.sets) })).reverse()
  const all = sessions.flatMap((s) => s.sets)
  const bestE1rm = Math.max(0, ...all.map((s) => e1rm(s.weight ?? 0, s.reps ?? 0, s.rpe)))
  const heaviest = Math.max(0, ...all.map((s) => s.weight ?? 0))
  const maxReps = Math.max(0, ...all.map((s) => s.reps ?? 0))
  const bestVolume = Math.max(0, ...sessions.map((s) => tonnage(s.sets)))
  const lastE1rm = points.length ? points[points.length - 1].y : 0
  const hasWeight = ex.type === 'weight_reps' || ex.type === 'weighted_bodyweight'
  const secondary = ex.secondary.map((m) => MUSCLE_LABEL[m].toLowerCase()).join(', ')

  return (
    <div className="page" style={{ paddingTop: 8 }}>
      <div>
        <TopBar />
        <h1 className="display title">{ex.name}</h1>
        <p className="small muted" style={{ marginTop: 6 }}>
          {MUSCLE_LABEL[ex.primary]}{secondary ? `, también ${secondary}` : ''}. {EQUIPMENT_LABEL[ex.equipment]}, sube de {fmtKg(incrementFor(ex))} en {fmtKg(incrementFor(ex))} kg.
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="empty"><p>Aún no lo has hecho. Cuando lo registres verás aquí tu progreso y tus récords.</p></div>
      ) : (
        <>
          <div className="figures">
            {hasWeight && <Figure value={fmtKg(bestE1rm)} label="Máximo estimado (kg)" />}
            {hasWeight && <Figure value={fmtKg(heaviest)} label="Más peso (kg)" />}
            <Figure value={maxReps} label="Más reps" />
            {hasWeight && <Figure value={fmtKg(bestVolume)} label="Mejor sesión (kg)" />}
          </div>
          {hasWeight && (
            <section className="section">
              <h2 className="h2">Máximo estimado por sesión</h2>
              <LineChart points={points} unit="kg" />
              <p className="ref">El peso que podrías levantar una vez, calculado con tus series y su RPE. Si no apuntas RPE, se asume que llegaste al fallo.</p>
            </section>
          )}
          {hasWeight && lastE1rm > 0 && (
            <section className="block">
              <h2 className="h2">¿Cuánto peso poner?</h2>
              <div className="row wrap" style={{ gap: 12 }}>
                <label className="stack tiny muted">Reps
                  <select className="cell" style={{ width: 72 }} value={reps} onChange={(e) => setReps(+e.target.value)}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((r) => <option key={r}>{r}</option>)}
                  </select>
                </label>
                <label className="stack tiny muted">RPE
                  <select className="cell" style={{ width: 72 }} value={rpe} onChange={(e) => setRpe(+e.target.value)}>
                    {RPE_VALUES.map((r) => <option key={r} value={r}>{String(r).replace('.', ',')}</option>)}
                  </select>
                </label>
                <div className="grow" style={{ textAlign: 'right' }}>
                  <span className="target-figure">{fmtKg(roundTo(loadForTarget(lastE1rm, reps, rpe), incrementFor(ex)))}<small>kg</small></span>
                </div>
              </div>
              <p className="ref">Según tu última sesión. RPE 8,5 = te quedan 1–2 repeticiones.</p>
            </section>
          )}
          <section className="section">
            <h2 className="h2">Sesiones</h2>
            <table className="data">
              <thead><tr><th>Fecha</th><th>Mejor serie</th><th>{hasWeight ? 'e1RM' : 'Series'}</th></tr></thead>
              <tbody>
                {sessions.slice(0, 20).map((s) => {
                  const top = [...s.sets].sort((a, b) => e1rm(b.weight ?? 0, b.reps ?? 0, b.rpe) - e1rm(a.weight ?? 0, a.reps ?? 0, a.rpe))[0]
                  return (
                    <tr key={s.w!.id} className="clickable" onClick={() => navigate(`/historial/${s.w!.id}`)}>
                      <td>{new Date(s.w!.startedAt).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</td>
                      <td className="strong">{top.durationSec ? `${top.durationSec} s` : `${hasWeight ? `${fmtKg(top.weight ?? 0)} × ` : ''}${top.reps}${top.rpe ? ` @${String(top.rpe).replace('.', ',')}` : ''}`}</td>
                      <td>{hasWeight ? fmtKg(sessionE1rm(s.sets)) : s.sets.length}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
      {ex.custom && (
        <button className="btn danger" onClick={async () => {
          if (confirm('¿Borrar este ejercicio? Su historial se conserva, pero aparecerá sin nombre.')) {
            await db.exercises.delete(ex.id)
            navigate('/ejercicios')
          }
        }}>Borrar ejercicio</button>
      )}
    </div>
  )
}
