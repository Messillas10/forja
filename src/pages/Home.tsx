import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { db, getActiveWorkout, startWorkout } from '../db'
import type { Routine } from '../types'

export default function Home() {
  const navigate = useNavigate()
  const active = useLiveQuery(() => getActiveWorkout().then((w) => w ?? null))
  const routines = useLiveQuery(() => db.routines.orderBy('name').toArray())
  const exercises = useLiveQuery(() => db.exercises.toArray().then((l) => new Map(l.map((e) => [e.id, e.name]))))

  async function start(r?: Routine) {
    await startWorkout(r)
    navigate('/entreno')
  }

  return (
    <div className="page">
      <h1>Entrenar</h1>
      {active ? (
        <Link to="/entreno" className="card link" style={{ border: '1px solid var(--accent)' }}>
          <div className="row between">
            <div>
              <b>{active.name}</b>
              <div className="muted">En curso desde {new Date(active.startedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <span className="btn primary small">Continuar</span>
          </div>
        </Link>
      ) : (
        <button className="btn primary block" onClick={() => start()}>+ Empezar entrenamiento vacío</button>
      )}

      <Link to="/entrenador" className="card link">
        <div className="row between">
          <div>
            <b>Entrenador</b>
            <div className="muted" style={{ fontSize: '0.85rem' }}>Envía tu resumen semanal o importa rutinas nuevas</div>
          </div>
          <span className="muted">›</span>
        </div>
      </Link>

      <div className="row between">
        <h2>Rutinas</h2>
        <Link to="/rutinas/nueva" className="btn ghost small">+ Nueva rutina</Link>
      </div>
      {routines?.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>Crea una rutina para empezar con un toque: los ejercicios, series, rangos de repeticiones y descansos quedan preparados, y Forja te sugiere la carga de cada día.</p>
        </div>
      )}
      {routines?.map((r) => (
        <div key={r.id} className="card">
          <div className="row between">
            <Link to={`/rutinas/${r.id}`} className="grow" style={{ color: 'inherit' }}>
              <b>{r.name}</b>
              <div className="muted" style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.exercises.map((e) => exercises?.get(e.exerciseId) ?? e.exerciseId).join(', ')}
              </div>
            </Link>
          </div>
          <button className="btn primary" disabled={!!active} onClick={() => start(r)}>Empezar rutina</button>
        </div>
      ))}
    </div>
  )
}
