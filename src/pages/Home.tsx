import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { CharacterCard } from '../components/game'
import { Icon } from '../components/icons'
import { cap } from '../components/ui'
import { db, getActiveWorkout, startWorkout } from '../db'
import { useGame } from '../hooks/useGame'
import type { Routine, Workout } from '../types'

const DAY = 86400000
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function mondayOf(t: number) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

/**
 * Grupo de rotación de una rutina: «A · Full body» → «A», «B · Torso (semana de 2 días)» → «B».
 * Si el nombre no empieza por una letra/código corto, la rutina es su propio grupo.
 */
const groupOf = (name: string) => {
  const first = name.trim().split(/\s+/)[0]
  return first.length <= 2 ? first.toUpperCase() : name
}

/** Siguiente rutina: el grupo que sigue al del último entreno con rutina (A → B → C → A). */
function nextRoutine(routines: Routine[], workouts: Workout[]): Routine | undefined {
  if (!routines.length) return undefined
  const groups = [...new Set(routines.map((r) => groupOf(r.name)))].sort((a, b) => a.localeCompare(b, 'es'))
  const firstOf = (g: string) => routines.filter((r) => groupOf(r.name) === g).sort((a, b) => a.name.length - b.name.length)[0]
  const last = workouts.filter((w) => w.endedAt && w.routineId).sort((a, b) => b.startedAt - a.startedAt)[0]
  const lastRoutine = last && routines.find((r) => r.id === last.routineId)
  if (!lastRoutine) return firstOf(groups[0])
  const i = groups.indexOf(groupOf(lastRoutine.name))
  return firstOf(groups[(i + 1) % groups.length])
}

export default function Home() {
  const navigate = useNavigate()
  const game = useGame()
  const data = useLiveQuery(async () => ({
    active: (await getActiveWorkout()) ?? null,
    routines: await db.routines.toArray(),
    workouts: await db.workouts.toArray(),
    names: new Map((await db.exercises.toArray()).map((e) => [e.id, e.name])),
  }))
  if (!data) return null
  const { active, routines, workouts, names } = data
  routines.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const next = nextRoutine(routines, workouts)

  async function start(r?: Routine) {
    await startWorkout(r)
    navigate('/entreno')
  }

  const monday = mondayOf(Date.now())
  const trainedDays = new Set(
    workouts.filter((w) => w.endedAt && w.startedAt >= monday).map((w) => Math.floor((w.startedAt - monday) / DAY)),
  )
  const todayIdx = Math.floor((Date.now() - monday) / DAY)
  const today = cap(new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }))

  return (
    <div className="page">
      <section className="hero">
        <p className="muted small">{today}</p>
        {active ? (
          <>
            <p className="h2 muted">Entreno en curso</p>
            <h1 className="display hero-name">{active.name}</h1>
            <Link to="/entreno" className="btn primary lg block-w">Continuar entreno</Link>
          </>
        ) : next ? (
          <>
            <p className="h2 muted">Te toca</p>
            <h1 className="display hero-name">{next.name}</h1>
            <p className="small muted">{next.exercises.map((e) => names.get(e.exerciseId) ?? e.exerciseId).join(', ')}</p>
            <button className="btn primary lg block-w" onClick={() => start(next)}>
              <Icon name="play" />Empezar
            </button>
          </>
        ) : (
          <>
            <h1 className="display hero-name">Entrenar</h1>
            <p className="muted">Crea tu primera rutina o empieza un entreno libre y añade ejercicios sobre la marcha.</p>
            <Link to="/rutinas/nueva" className="btn primary lg block-w">Crear rutina</Link>
          </>
        )}
      </section>

      {game && <CharacterCard g={game} />}

      <section className="section" aria-label="Esta semana">
        <div className="section-head">
          <h2 className="h2">Esta semana</h2>
          <span className="small muted">{trainedDays.size} {trainedDays.size === 1 ? 'sesión' : 'sesiones'}</span>
        </div>
        <div className="week">
          {DAYS.map((d, i) => (
            <div key={d} className={`week-day${trainedDays.has(i) ? ' trained' : ''}${i === todayIdx ? ' today' : ''}`}>
              <i />
              {d}
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">Rutinas</h2>
          <Link to="/rutinas/nueva" className="btn quiet sm"><Icon name="plus" />Nueva</Link>
        </div>
        {routines.length > 0 && (
          <div className="list">
            {routines.map((r) => (
              <div key={r.id} className="list-row">
                <Link to={`/rutinas/${r.id}`} className="grow" aria-label={`Editar ${r.name}`}>
                  <div style={{ fontWeight: 650 }}>{r.name}</div>
                  <div className="tiny muted">{r.exercises.length} ejercicios, {r.exercises.reduce((a, e) => a + e.sets, 0)} series</div>
                </Link>
                <button className="btn outline sm" disabled={!!active} onClick={() => start(r)}>Empezar</button>
              </div>
            ))}
          </div>
        )}
        {!active && (
          <button className="btn outline block-w" onClick={() => start()}>Entreno libre</button>
        )}
      </section>

      <Link to="/entrenador" className="list" aria-label="Entrenador">
        <div className="list-row">
          <Icon name="coach" />
          <div className="grow">
            <div style={{ fontWeight: 650 }}>Entrenador</div>
            <div className="tiny muted">Envía tu semana o importa rutinas nuevas</div>
          </div>
          <Icon name="chev" className="chev" />
        </div>
      </Link>
    </div>
  )
}
