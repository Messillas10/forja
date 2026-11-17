import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExercisePicker } from '../components/ExercisePicker'
import { fmtKg, Sheet } from '../components/ui'
import { addExercisesToWorkout, db, deleteWorkout, exerciseHistory, finishWorkout, getActiveWorkout } from '../db'
import { RPE_VALUES, tonnage, warmupSets } from '../lib/formulas'
import { incrementFor, suggestNext, type Suggestion } from '../lib/progression'
import { fmtClock, restTimer } from '../lib/restTimer'
import type { Exercise, SetKind, Workout, WorkoutExerciseMeta, WorkoutSet } from '../types'

const KIND_ORDER: SetKind[] = ['normal', 'warmup', 'drop', 'failure']
const KIND_LABEL: Record<SetKind, string> = { normal: '', warmup: 'C', drop: 'D', failure: 'F' }

export default function ActiveWorkout() {
  const navigate = useNavigate()
  const workout = useLiveQuery(() => getActiveWorkout().then((w) => w ?? null))
  const wid = workout?.id
  const metas = useLiveQuery(() => (wid ? db.workoutExercises.where('workoutId').equals(wid).sortBy('exerciseOrder') : []), [wid])
  const sets = useLiveQuery(() => (wid ? db.sets.where('workoutId').equals(wid).toArray() : []), [wid])
  const exercises = useLiveQuery(() => db.exercises.toArray().then((l) => new Map(l.map((e) => [e.id, e]))))
  const [picking, setPicking] = useState(false)
  const [finishing, setFinishing] = useState(false)

  if (workout === undefined || !metas || !sets || !exercises) return null
  if (workout === null) {
    return (
      <div className="page">
        <p className="empty">No hay ningún entrenamiento en curso.</p>
        <button className="btn primary" onClick={() => navigate('/')}>Volver</button>
      </div>
    )
  }

  const done = sets.filter((s) => s.done && s.kind !== 'warmup')

  return (
    <>
      <WorkoutHeader workout={workout} volume={tonnage(done)} setsDone={done.length} onFinish={() => setFinishing(true)} />
      <div className="page" style={{ paddingTop: 12 }}>
        {metas.map((m) => {
          const ex = exercises.get(m.exerciseId)
          if (!ex) return null
          return <ExerciseBlock key={m.id} meta={m} ex={ex} sets={sets.filter((s) => s.exerciseOrder === m.exerciseOrder).sort((a, b) => a.setIndex - b.setIndex)} />
        })}
        {metas.length === 0 && <p className="empty">Añade tu primer ejercicio para empezar.</p>}
        <button className="btn primary block" onClick={() => setPicking(true)}>+ Añadir ejercicio</button>
        <button
          className="btn danger block"
          onClick={async () => {
            if (confirm('¿Descartar este entrenamiento? Se perderán las series.')) {
              restTimer.stop()
              await deleteWorkout(workout.id!)
              navigate('/')
            }
          }}
        >
          Descartar entrenamiento
        </button>
      </div>
      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={async (ids) => {
            setPicking(false)
            await addExercisesToWorkout(workout.id!, ids)
          }}
        />
      )}
      {finishing && (
        <FinishSheet
          setsDone={done.length}
          onClose={() => setFinishing(false)}
          onConfirm={async (rpe) => {
            restTimer.stop()
            await finishWorkout(workout.id!, rpe)
            navigate(`/historial/${workout.id}`, { replace: true })
          }}
        />
      )}
    </>
  )
}

function WorkoutHeader({ workout, volume, setsDone, onFinish }: { workout: Workout; volume: number; setsDone: number; onFinish: () => void }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const elapsed = Math.floor((now - workout.startedAt) / 1000)
  const h = Math.floor(elapsed / 3600)
  return (
    <div className="workout-head">
      <div className="grow stack" style={{ gap: 2 }}>
        <input
          className="input"
          style={{ background: 'transparent', padding: 0, minHeight: 0, fontWeight: 700, fontSize: '1.05rem' }}
          value={workout.name}
          onChange={(e) => db.workouts.update(workout.id!, { name: e.target.value })}
          aria-label="Nombre del entrenamiento"
        />
        <div className="workout-stats muted">
          <span><b>{h ? `${h}:` : ''}{fmtClock(elapsed % 3600)}</b>Duración</span>
          <span><b>{fmtKg(volume)} kg</b>Volumen</span>
          <span><b>{setsDone}</b>Series</span>
        </div>
      </div>
      <button className="btn ok" onClick={onFinish}>Terminar</button>
    </div>
  )
}

function ExerciseBlock({ meta, ex, sets }: { meta: WorkoutExerciseMeta; ex: Exercise; sets: WorkoutSet[] }) {
  const history = useLiveQuery(() => exerciseHistory(ex.id, meta.workoutId, 6), [ex.id, meta.workoutId])
  const [config, setConfig] = useState(false)
  const target = { repMin: meta.repMin ?? 8, repMax: meta.repMax ?? 12, targetRpe: meta.targetRpe }
  const suggestion = useMemo(() => (history ? suggestNext(ex, history, target) : null), [history, ex, target.repMin, target.repMax, target.targetRpe]) // eslint-disable-line react-hooks/exhaustive-deps
  const prev = history?.[0] ?? []
  const showWeight = ex.type === 'weight_reps' || ex.type === 'weighted_bodyweight'
  const isDuration = ex.type === 'duration'

  async function addSet() {
    const last = sets[sets.length - 1]
    await db.sets.add({
      workoutId: meta.workoutId,
      exerciseId: ex.id,
      exerciseOrder: meta.exerciseOrder,
      setIndex: (last?.setIndex ?? -1) + 1,
      kind: 'normal',
      weight: last?.weight,
      reps: last?.reps,
      durationSec: last?.durationSec,
      done: false,
    })
  }

  async function removeLastSet() {
    const last = [...sets].reverse().find((s) => !s.done) ?? sets[sets.length - 1]
    if (last) await db.sets.delete(last.id!)
  }

  async function addWarmup() {
    const work = sets.find((s) => s.kind === 'normal')?.weight ?? suggestion?.weight ?? prev[0]?.weight
    if (!work) return alert('Indica primero el peso de trabajo.')
    const ws = warmupSets(work, incrementFor(ex))
    await db.transaction('rw', db.sets, async () => {
      for (const s of sets) await db.sets.update(s.id!, { setIndex: s.setIndex + ws.length })
      await db.sets.bulkAdd(
        ws.map((w, i) => ({ workoutId: meta.workoutId, exerciseId: ex.id, exerciseOrder: meta.exerciseOrder, setIndex: i, kind: 'warmup' as const, weight: w.weight, reps: w.reps, done: false })),
      )
    })
  }

  async function removeExercise() {
    if (!confirm(`¿Quitar ${ex.name} del entrenamiento?`)) return
    await db.transaction('rw', db.sets, db.workoutExercises, async () => {
      await db.sets.where('[workoutId+exerciseOrder]').equals([meta.workoutId, meta.exerciseOrder]).delete()
      await db.workoutExercises.delete(meta.id!)
    })
  }

  const labels = sets.reduce<string[]>((acc, s) => {
    const n = acc.filter((_, i) => sets[i].kind === 'normal').length
    return [...acc, KIND_LABEL[s.kind] || String(n + 1)]
  }, [])
  return (
    <div className="ex-card">
      <div className="row between">
        <span className="ex-title">{ex.name}</span>
        <button className="btn ghost small" onClick={() => setConfig((c) => !c)} aria-label="Ajustes del ejercicio">⋯</button>
      </div>
      {config && (
        <div className="stack" style={{ background: 'var(--surface-2)', padding: 10, borderRadius: 8 }}>
          <div className="row wrap">
            <label className="row">Reps <input className="cell" type="number" inputMode="numeric" value={meta.repMin ?? ''} onChange={(e) => db.workoutExercises.update(meta.id!, { repMin: +e.target.value || undefined })} />–<input className="cell" type="number" inputMode="numeric" value={meta.repMax ?? ''} onChange={(e) => db.workoutExercises.update(meta.id!, { repMax: +e.target.value || undefined })} /></label>
            <label className="row">RPE obj.
              <select className="cell rpe" value={meta.targetRpe ?? ''} onChange={(e) => db.workoutExercises.update(meta.id!, { targetRpe: e.target.value ? +e.target.value : undefined })}>
                <option value="">–</option>
                {RPE_VALUES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="row">Descanso
              <select className="cell" style={{ maxWidth: 80 }} value={meta.restSec} onChange={(e) => db.workoutExercises.update(meta.id!, { restSec: +e.target.value })}>
                {[0, 30, 45, 60, 90, 120, 150, 180, 240, 300].map((s) => <option key={s} value={s}>{s ? fmtClock(s) : 'No'}</option>)}
              </select>
            </label>
          </div>
          <div className="row wrap">
            {showWeight && <button className="btn small" onClick={addWarmup}>+ Series de calentamiento</button>}
            <button className="btn small danger" onClick={removeExercise}>Quitar ejercicio</button>
          </div>
        </div>
      )}
      {suggestion && <SuggestionLine s={suggestion} showWeight={showWeight} />}
      <table className="sets">
        <thead>
          <tr>
            <th>Serie</th>
            <th>Anterior</th>
            {showWeight && <th>{ex.type === 'weighted_bodyweight' ? '+kg' : 'kg'}</th>}
            <th>{isDuration ? 'seg' : 'Reps'}</th>
            {!isDuration && <th>RPE</th>}
            <th>✓</th>
          </tr>
        </thead>
        <tbody>
          {sets.map((s, i) => {
            const p = prev[s.setIndex]
            const sug = s.kind === 'normal' ? suggestion : null
            return (
              <SetRow
                key={s.id}
                s={s}
                label={labels[i]}
                prev={p}
                placeholder={{ weight: sug?.weight || p?.weight, reps: sug?.reps || p?.reps, durationSec: p?.durationSec }}
                showWeight={showWeight}
                isDuration={isDuration}
                restSec={s.kind === 'warmup' ? Math.min(60, meta.restSec) : meta.restSec}
              />
            )
          })}
        </tbody>
      </table>
      <div className="row">
        <button className="btn grow" onClick={addSet}>+ Añadir serie</button>
        {sets.length > 0 && <button className="btn" onClick={removeLastSet} aria-label="Quitar serie">−</button>}
      </div>
    </div>
  )
}

function SuggestionLine({ s, showWeight }: { s: Suggestion; showWeight: boolean }) {
  const cls = { subir: 'up', mantener: 'hold', bajar: 'down', descarga: 'deload', nuevo: 'hold' }[s.action]
  return (
    <div className="suggest">
      <span className={`badge ${cls}`}>{s.action}</span>
      <div className="grow">
        <b>{showWeight && s.weight ? `${fmtKg(s.weight)} kg × ` : ''}{s.reps} reps{s.rpe ? ` @RPE ${s.rpe}` : ''}</b>
        <div className="muted" style={{ fontSize: '0.8rem' }}>{s.reason}</div>
      </div>
    </div>
  )
}

function SetRow({ s, label, prev, placeholder, showWeight, isDuration, restSec }: {
  s: WorkoutSet
  label: string
  prev?: WorkoutSet
  placeholder: { weight?: number; reps?: number; durationSec?: number }
  showWeight: boolean
  isDuration: boolean
  restSec: number
}) {
  const update = (patch: Partial<WorkoutSet>) => db.sets.update(s.id!, patch)
  const num = (v: string) => (v === '' ? undefined : Number(v.replace(',', '.')))
  const select = (e: React.FocusEvent<HTMLInputElement>) => e.target.select()

  async function toggleDone() {
    if (s.done) return update({ done: false, completedAt: undefined })
    const patch: Partial<WorkoutSet> = { done: true, completedAt: Date.now() }
    if (showWeight && s.weight == null) patch.weight = placeholder.weight ?? 0
    if (isDuration) {
      if (s.durationSec == null) patch.durationSec = placeholder.durationSec
      if (patch.durationSec == null && s.durationSec == null) return navigator.vibrate?.(80)
    } else {
      if (s.reps == null) patch.reps = placeholder.reps
      if (patch.reps == null && s.reps == null) return navigator.vibrate?.(80)
    }
    await update(patch)
    restTimer.start(restSec)
  }

  const prevText = prev
    ? isDuration
      ? `${prev.durationSec ?? 0} s`
      : `${showWeight ? `${fmtKg(prev.weight ?? 0)}×` : ''}${prev.reps ?? 0}${prev.rpe ? ` @${prev.rpe}` : ''}`
    : '—'

  return (
    <tr className={s.done ? 'done' : ''}>
      <td>
        <button className={`set-num ${s.kind}`} onClick={() => update({ kind: KIND_ORDER[(KIND_ORDER.indexOf(s.kind) + 1) % KIND_ORDER.length] })} title="Tipo: normal / calentamiento / drop / fallo">
          {label}
        </button>
      </td>
      <td>
        <button className="prev" disabled={!prev} onClick={() => prev && update({ weight: prev.weight, reps: prev.reps, durationSec: prev.durationSec })}>{prevText}</button>
      </td>
      {showWeight && (
        <td><input className="cell" type="text" inputMode="decimal" value={s.weight ?? ''} placeholder={placeholder.weight != null ? fmtKg(placeholder.weight) : ''} onFocus={select} onChange={(e) => update({ weight: num(e.target.value) })} aria-label="Peso" /></td>
      )}
      <td>
        {isDuration ? (
          <input className="cell" type="text" inputMode="numeric" value={s.durationSec ?? ''} placeholder={placeholder.durationSec?.toString() ?? ''} onFocus={select} onChange={(e) => update({ durationSec: num(e.target.value) })} aria-label="Segundos" />
        ) : (
          <input className="cell" type="text" inputMode="numeric" value={s.reps ?? ''} placeholder={placeholder.reps?.toString() ?? ''} onFocus={select} onChange={(e) => update({ reps: num(e.target.value) })} aria-label="Repeticiones" />
        )}
      </td>
      {!isDuration && (
        <td>
          <select className="cell rpe" value={s.rpe ?? ''} onChange={(e) => update({ rpe: e.target.value ? Number(e.target.value) : undefined })} aria-label="RPE">
            <option value="">–</option>
            {RPE_VALUES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </td>
      )}
      <td><button className="check" onClick={toggleDone} aria-label="Completar serie">✓</button></td>
    </tr>
  )
}

const SESSION_RPE = [
  [1, 'Muy, muy fácil'], [2, 'Fácil'], [3, 'Moderado'], [4, 'Algo duro'], [5, 'Duro'],
  [6, 'Duro+'], [7, 'Muy duro'], [8, 'Muy duro+'], [9, 'Casi máximo'], [10, 'Máximo'],
] as const

function FinishSheet({ setsDone, onClose, onConfirm }: { setsDone: number; onClose: () => void; onConfirm: (rpe?: number) => void }) {
  const [rpe, setRpe] = useState<number | undefined>()
  return (
    <Sheet title="Terminar entrenamiento" onClose={onClose} auto>
      {setsDone === 0 && <p className="muted">No has completado ninguna serie. Las series sin marcar se descartan.</p>}
      <div className="stack">
        <b>¿Cómo de duro ha sido? (RPE de sesión)</b>
        <small>Escala CR-10 de Foster (2001). Sirve para calcular tu carga semanal y el ratio agudo:crónico.</small>
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {SESSION_RPE.map(([v, l]) => (
            <button key={v} className={`chip${rpe === v ? ' on' : ''}`} style={{ borderRadius: 10, padding: '8px 2px' }} onClick={() => setRpe(v)} title={l}>{v}</button>
          ))}
        </div>
        {rpe && <small>{SESSION_RPE[rpe - 1][1]}</small>}
      </div>
      <button className="btn ok block" onClick={() => onConfirm(rpe)}>Guardar entrenamiento</button>
    </Sheet>
  )
}
