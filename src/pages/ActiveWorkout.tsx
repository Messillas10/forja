import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExercisePicker } from '../components/ExercisePicker'
import { Icon } from '../components/icons'
import { Figure, fmtKg, Sheet } from '../components/ui'
import { MUSCLE_LABEL } from '../data/exercises'
import { addExercisesToWorkout, db, deleteWorkout, exerciseHistory, finishWorkout, getActiveWorkout } from '../db'
import { RPE_VALUES, tonnage, warmupSets } from '../lib/formulas'
import { incrementFor, suggestNext, type Suggestion } from '../lib/progression'
import { Meter } from '../components/game'
import { expToast, loadGameInput } from '../hooks/useGame'
import { EXP, previewFinish } from '../lib/game'
import { compareExercise, compareSet, formatSession, matchPrevious, type Verdict } from '../lib/overload'
import { fmtClock, restTimer } from '../lib/restTimer'
import type { Exercise, SetKind, WeighCond, Workout, WorkoutExerciseMeta, WorkoutSet } from '../types'

const KIND_ORDER: SetKind[] = ['normal', 'warmup', 'drop', 'failure']
const KIND_LABEL: Record<SetKind, string> = { normal: '', warmup: 'C', drop: 'D', failure: 'F' }
const KIND_NAME: Record<SetKind, string> = { normal: 'normal', warmup: 'calentamiento', drop: 'drop set', failure: 'al fallo' }

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
        <div className="empty">
          <h1 className="display title">Sin entreno en curso</h1>
          <p>Empieza uno desde la pantalla de inicio.</p>
          <button className="btn primary" onClick={() => navigate('/')}>Ir a inicio</button>
        </div>
      </div>
    )
  }

  const work = sets.filter((s) => s.kind !== 'warmup')
  const done = work.filter((s) => s.done)

  return (
    <>
      <WorkoutHeader workout={workout} volume={tonnage(done)} setsDone={done.length} setsTotal={work.length} onFinish={() => setFinishing(true)} />
      <div className="page flush-top" style={{ gap: 14, paddingTop: 14, paddingBottom: 'calc(110px + var(--safe-b))' }}>
        <WeighInPrompt />
        {metas.map((m) => {
          const ex = exercises.get(m.exerciseId)
          if (!ex) return null
          return <ExerciseBlock key={m.id} meta={m} ex={ex} sets={sets.filter((s) => s.exerciseOrder === m.exerciseOrder).sort((a, b) => a.setIndex - b.setIndex)} />
        })}
        {metas.length === 0 && (
          <div className="empty" style={{ padding: '24px 4px' }}>
            <h2 className="h2">Entreno vacío</h2>
            <p>Añade el primer ejercicio. Las series se guardan al momento, aunque cierres la app.</p>
          </div>
        )}
        <button className="btn ink lg block-w" onClick={() => setPicking(true)}><Icon name="plus" />Añadir ejercicio</button>
        <button
          className="btn danger block-w"
          onClick={async () => {
            if (confirm('¿Descartar este entreno? Se borrarán todas sus series.')) {
              restTimer.stop()
              await deleteWorkout(workout.id!)
              navigate('/')
            }
          }}
        >
          Descartar entreno
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
          workout={workout}
          metas={metas}
          sets={sets}
          exercises={exercises}
          setsDone={done.length}
          volume={tonnage(done)}
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

const dayKey = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE')
const SKIP_KEY = 'forja.peso.omitido'
const COND_OPTS: [WeighCond, string][] = [['normal', 'Lo normal'], ['ayunas', 'En ayunas'], ['comido', 'Recién comido']]

/**
 * Pesaje en el gimnasio, antes de entrenar: siempre en las mismas condiciones (misma báscula, misma hora
 * aproximada, ropa parecida). No hace falta ayunas: lo que cuenta es que sea comparable y la media semanal.
 * Solo aparece si hoy no hay pesaje y no lo has omitido.
 */
function WeighInPrompt() {
  const today = dayKey()
  const weighed = useLiveQuery(() => db.bodyweights.where('date').aboveOrEqual(new Date(today + 'T00:00').getTime()).count(), [today])
  const [kg, setKg] = useState('')
  const [cond, setCond] = useState<WeighCond>('normal')
  const [skipped, setSkipped] = useState(() => {
    try {
      return localStorage.getItem(SKIP_KEY) === today
    } catch {
      return false
    }
  })
  if (weighed === undefined || weighed > 0 || skipped) return null
  const value = Number(kg.replace(',', '.'))
  const valid = value >= 25 && value <= 300

  return (
    <form
      className="block"
      style={{ gap: 8 }}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valid) return
        await db.bodyweights.add({ date: Date.now(), kg: value, ...(cond !== 'normal' && { cond }) })
        navigator.vibrate?.(15)
      }}
    >
      <div className="row between">
        <b>Peso de hoy</b>
        <button
          type="button"
          className="btn quiet sm"
          onClick={() => {
            try {
              localStorage.setItem(SKIP_KEY, today)
            } catch {
              /* ignorar */
            }
            setSkipped(true)
          }}
        >
          Hoy no
        </button>
      </div>
      <div className="row" role="radiogroup" aria-label="Cómo vienes">
        {COND_OPTS.map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={cond === v} className={`btn sm grow ${cond === v ? 'ink' : 'quiet'}`} onClick={() => setCond(v)}>
            {label}
          </button>
        ))}
      </div>
      <div className="row">
        <input className="field grow num" inputMode="decimal" placeholder="kg en la báscula del gimnasio" value={kg} onChange={(e) => setKg(e.target.value)} aria-label="Peso de hoy en kg" />
        <button className="btn ink" disabled={!valid}>Guardar</button>
      </div>
      <span className="small muted">
        {cond === 'normal'
          ? 'Lo normal: después de clase, antes de entrenar, en la báscula del gimnasio. Solo estos cuentan para la media y el ritmo.'
          : 'Se guarda como referencia, pero no cuenta para la media ni el ritmo: en ayunas o recién comido el peso cambia 0,5-2 kg.'}
      </span>
    </form>
  )
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

const fmtElapsed = (sec: number) => {
  const h = Math.floor(sec / 3600)
  return h ? `${h}:${fmtClock(sec % 3600).padStart(5, '0')}` : fmtClock(sec)
}

function WorkoutHeader({ workout, volume, setsDone, setsTotal, onFinish }: { workout: Workout; volume: number; setsDone: number; setsTotal: number; onFinish: () => void }) {
  const navigate = useNavigate()
  const now = useNow()
  const elapsed = Math.max(0, Math.floor((now - workout.startedAt) / 1000))
  return (
    <header className="wk-head">
      <div className="row">
        <button className="icon-btn" style={{ marginLeft: -10 }} onClick={() => navigate('/')} aria-label="Salir sin terminar (el entreno sigue en curso)"><Icon name="back" /></button>
        <input className="wk-name grow" value={workout.name} onChange={(e) => db.workouts.update(workout.id!, { name: e.target.value })} aria-label="Nombre del entreno" />
        <button className="btn done sm" onClick={onFinish}>Terminar</button>
      </div>
      <div className="wk-stats">
        <div><b>{fmtElapsed(elapsed)}</b><span>Tiempo</span></div>
        <div><b>{fmtKg(volume)}</b><span>kg movidos</span></div>
        <div><b>{setsDone}<span style={{ fontSize: '1rem', color: 'var(--steel)' }}>/{setsTotal}</span></b><span>Series</span></div>
      </div>
    </header>
  )
}

function ExerciseBlock({ meta, ex, sets }: { meta: WorkoutExerciseMeta; ex: Exercise; sets: WorkoutSet[] }) {
  const history = useLiveQuery(() => exerciseHistory(ex.id, meta.workoutId, 6), [ex.id, meta.workoutId])
  const [config, setConfig] = useState(false)
  const target = { repMin: meta.repMin ?? 8, repMax: meta.repMax ?? 12, targetRpe: meta.targetRpe }
  const suggestion = useMemo(() => (history ? suggestNext(ex, history, target) : null), [history, ex, target.repMin, target.repMax, target.targetRpe]) // eslint-disable-line react-hooks/exhaustive-deps
  const prev = history?.[0] ?? []
  const prevWid = prev[0]?.workoutId
  const prevMeta = useLiveQuery(
    () => (prevWid ? db.workoutExercises.where('workoutId').equals(prevWid).filter((m) => m.exerciseId === ex.id).first() : undefined),
    [prevWid, ex.id],
  )
  const prevDate = prev.reduce((t, s) => Math.max(t, s.completedAt ?? 0), 0)
  const matched = matchPrevious(sets, prev)
  const verdict = compareExercise(sets, prev, ex.type)
  const [noting, setNoting] = useState(false)
  const complete = sets.length > 0 && sets.every((x) => x.done)
  const beatAll = complete && verdict === 'up'
  const prevBeat = useRef<boolean | undefined>(undefined)
  useEffect(() => {
    if (!history) return
    // Solo avisa al pasar a «superado» mientras entrenas, no al abrir la pantalla
    if (prevBeat.current === false && beatAll) setTimeout(() => expToast(`+${EXP.exercise} EXP · ${ex.name} superado`), 900)
    prevBeat.current = beatAll
  }, [beatAll, history, ex.name])
  const showWeight = ex.type === 'weight_reps' || ex.type === 'weighted_bodyweight'
  const isDuration = ex.type === 'duration'
  const rowClass = isDuration ? 'duration' : showWeight ? '' : 'no-weight'

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
    if (!work) return alert('Escribe primero el peso de la primera serie de trabajo.')
    const ws = warmupSets(work, incrementFor(ex))
    await db.transaction('rw', db.sets, async () => {
      for (const s of sets) await db.sets.update(s.id!, { setIndex: s.setIndex + ws.length })
      await db.sets.bulkAdd(
        ws.map((w, i) => ({ workoutId: meta.workoutId, exerciseId: ex.id, exerciseOrder: meta.exerciseOrder, setIndex: i, kind: 'warmup' as const, weight: w.weight, reps: w.reps, done: false })),
      )
    })
    setConfig(false)
  }

  async function removeExercise() {
    if (!confirm(`¿Quitar ${ex.name} de este entreno?`)) return
    await db.transaction('rw', db.sets, db.workoutExercises, async () => {
      await db.sets.where('[workoutId+exerciseOrder]').equals([meta.workoutId, meta.exerciseOrder]).delete()
      await db.workoutExercises.delete(meta.id!)
    })
  }

  const labels = sets.reduce<string[]>((acc, s, i) => {
    const n = sets.slice(0, i).filter((x) => x.kind === 'normal').length
    return [...acc, KIND_LABEL[s.kind] || String(n + 1)]
  }, [])
  const doneCount = sets.filter((s) => s.done).length

  return (
    <section className="exercise" aria-label={ex.name}>
      <div className="exercise-head">
        <div className="grow">
          <div className="exercise-name">{ex.name}</div>
          <div className="tiny muted">
            {MUSCLE_LABEL[ex.primary]}, {target.repMin}–{target.repMax} reps{target.targetRpe ? ` a RPE ${String(target.targetRpe).replace('.', ',')}` : ''}, descanso {fmtClock(meta.restSec)}
          </div>
        </div>
        {verdict && doneCount === sets.length && sets.length > 0 ? (
          <span className={`tag ${VERDICT_CLASS[verdict]}`} style={{ marginTop: 2 }}>{VERDICT_TEXT[verdict]}</span>
        ) : (
          <span className="tiny muted num" style={{ fontSize: '0.95rem', paddingTop: 2 }}>{doneCount}/{sets.length}</span>
        )}
        <button className="icon-btn" style={{ marginTop: -8, marginRight: -6 }} onClick={() => setConfig((c) => !c)} aria-label="Ajustes del ejercicio" aria-expanded={config}><Icon name="more" /></button>
      </div>

      {config && (
        <div className="settings fade-in">
          <label>Rango de reps
            <span className="range">
              <input className="cell" type="number" inputMode="numeric" value={meta.repMin ?? ''} onChange={(e) => db.workoutExercises.update(meta.id!, { repMin: +e.target.value || undefined })} aria-label="Reps mínimas" />
              –
              <input className="cell" type="number" inputMode="numeric" value={meta.repMax ?? ''} onChange={(e) => db.workoutExercises.update(meta.id!, { repMax: +e.target.value || undefined })} aria-label="Reps máximas" />
            </span>
          </label>
          <label>RPE objetivo
            <select className="cell" value={meta.targetRpe ?? ''} onChange={(e) => db.workoutExercises.update(meta.id!, { targetRpe: e.target.value ? +e.target.value : undefined })}>
              <option value="">Sin RPE</option>
              {RPE_VALUES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label>Descanso
            <select className="cell" value={meta.restSec} onChange={(e) => db.workoutExercises.update(meta.id!, { restSec: +e.target.value })}>
              {[0, 30, 45, 60, 90, 120, 150, 180, 240, 300].map((s) => <option key={s} value={s}>{s ? fmtClock(s) : 'Sin descanso'}</option>)}
            </select>
          </label>
          <div className="actions">
            {showWeight && <button className="btn sm outline" onClick={addWarmup}>Añadir calentamiento</button>}
            <button className="btn sm danger" onClick={removeExercise}>Quitar ejercicio</button>
          </div>
        </div>
      )}

      {prev.length > 0 && (
        <div className="last-time">
          <span className="last-time-when">Última vez{prevDate ? ` · ${fmtDay(prevDate)}` : ''}</span>
          <span className="last-time-sets">{formatSession(prev, ex.type)}</span>
          {prevMeta?.notes && <span className="last-time-note">«{prevMeta.notes}»</span>}
        </div>
      )}

      {suggestion && <Target s={suggestion} showWeight={showWeight} />}

      <div className="sets" role="table" aria-label={`Series de ${ex.name}`}>
        <div className={`set-row head ${rowClass}`} role="row">
          <span>Serie</span>
          <span>Anterior</span>
          {showWeight && <span>{ex.type === 'weighted_bodyweight' ? '+kg' : 'kg'}</span>}
          <span>{isDuration ? 'Segundos' : 'Reps'}</span>
          {!isDuration && <span>RPE</span>}
          <span />
        </div>
        {sets.map((s, i) => {
          const p = matched[i]
          const sug = s.kind === 'normal' ? suggestion : null
          return (
            <SetRow
              key={s.id}
              s={s}
              label={labels[i]}
              prev={p}
              cmp={s.done ? compareSet(s, p, ex.type) : null}
              type={ex.type}
              placeholder={{ weight: sug?.weight || p?.weight, reps: sug?.reps || p?.reps, durationSec: p?.durationSec }}
              showWeight={showWeight}
              isDuration={isDuration}
              rowClass={rowClass}
              restSec={s.kind === 'warmup' ? Math.min(60, meta.restSec) : meta.restSec}
            />
          )
        })}
      </div>
      <div className="row">
        <button className="btn grow" onClick={addSet}><Icon name="plus" />Añadir serie</button>
        {sets.length > 0 && <button className="btn" style={{ width: 52, padding: 0 }} onClick={removeLastSet} aria-label="Quitar la última serie"><Icon name="minus" /></button>}
        <button className={`btn${meta.notes ? ' ink' : ''}`} style={{ padding: '0 14px' }} onClick={() => setNoting((n) => !n)} aria-expanded={noting}>Nota</button>
      </div>
      {(noting || meta.notes) && (
        <textarea
          className="field"
          style={{ color: 'var(--ink)' }}
          rows={2}
          placeholder="Para el entrenador: sensaciones, molestias, máquina ocupada, cambio de ejercicio…"
          value={meta.notes ?? ''}
          onChange={(e) => db.workoutExercises.update(meta.id!, { notes: e.target.value || undefined })}
          aria-label={`Nota sobre ${ex.name}`}
        />
      )}
    </section>
  )
}

const VERDICT_TEXT: Record<Verdict, string> = { up: '▲ Superado', equal: '= Igualado', down: '▼ Por debajo' }
const VERDICT_CLASS: Record<Verdict, string> = { up: 'up', equal: '', down: 'down' }
const VERDICT_SET: Record<Verdict, string> = { up: 'Mejor que la vez anterior', equal: 'Igual que la vez anterior', down: 'Por debajo de la vez anterior' }
const fmtDay = (t: number) => new Date(t).toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace(',', '')

const ACTION_TEXT: Record<Suggestion['action'], string> = { subir: 'Sube', mantener: 'Mantén', bajar: 'Baja', descarga: 'Descarga', nuevo: 'Nuevo' }
const ACTION_CLASS: Record<Suggestion['action'], string> = { subir: 'up', mantener: '', bajar: 'down', descarga: 'deload', nuevo: '' }

function Target({ s, showWeight }: { s: Suggestion; showWeight: boolean }) {
  return (
    <div className="target">
      <div className="target-figure">
        {showWeight && s.weight ? <>{fmtKg(s.weight)}<small>kg</small> × </> : null}
        {s.reps}<small>reps</small>
      </div>
      <div className="grow stack" style={{ gap: 3 }}>
        <span className={`tag ${ACTION_CLASS[s.action]}`} style={{ alignSelf: 'flex-start' }}>
          {s.action === 'subir' && <Icon name="up" className="tag-icon" />}
          {ACTION_TEXT[s.action]}
        </span>
        <p>{s.reason}</p>
      </div>
    </div>
  )
}

function SetRow({ s, label, prev, cmp, type, placeholder, showWeight, isDuration, rowClass, restSec }: {
  s: WorkoutSet
  type: Exercise['type']
  label: string
  prev?: WorkoutSet
  cmp: ReturnType<typeof compareSet>
  placeholder: { weight?: number; reps?: number; durationSec?: number }
  showWeight: boolean
  isDuration: boolean
  rowClass: string
  restSec: number
}) {
  const update = (patch: Partial<WorkoutSet>) => db.sets.update(s.id!, patch)
  const num = (v: string) => (v === '' ? undefined : Number(v.replace(',', '.')))
  const select = (e: React.FocusEvent<HTMLInputElement>) => e.target.select()
  const shown = (v?: number) => (v == null ? '' : String(v).replace('.', ','))

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
    navigator.vibrate?.(15)
    restTimer.start(restSec)
    if (s.kind !== 'warmup') {
      const c = compareSet({ ...s, ...patch }, prev, type)
      if (c?.verdict === 'up') expToast(`+${EXP.set} EXP · ${c.label}`)
    }
  }

  const prevText = prev
    ? isDuration
      ? `${prev.durationSec ?? 0} s`
      : `${showWeight ? `${fmtKg(prev.weight ?? 0)}×` : ''}${prev.reps ?? 0}`
    : '–'
  const prevLabel = prev ? `${prevText}${prev.rpe ? ` a RPE ${String(prev.rpe).replace('.', ',')}` : ''}` : ''

  return (
    <div className={`set-row ${rowClass}${s.done ? ' done' : ''}`} role="row">
      <button
        className={`set-kind ${s.kind}`}
        onClick={() => update({ kind: KIND_ORDER[(KIND_ORDER.indexOf(s.kind) + 1) % KIND_ORDER.length] })}
        aria-label={`Serie ${label}, ${KIND_NAME[s.kind]}. Toca para cambiar el tipo`}
      >
        {label}
      </button>
      {cmp ? (
        <span className={`beat ${cmp.verdict}`} title={`Antes: ${prevLabel}`} aria-label={`${VERDICT_SET[cmp.verdict]} (antes ${prevLabel}): ${cmp.detail ?? cmp.label}`}>
          <span aria-hidden="true">{cmp.verdict === 'up' ? '▲' : cmp.verdict === 'down' ? '▼' : '='}</span>
          {cmp.verdict !== 'equal' ? cmp.label : 'igual'}
        </span>
      ) : (
        <button className="prev" disabled={!prev} onClick={() => prev && update({ weight: prev.weight, reps: prev.reps, durationSec: prev.durationSec })} aria-label={prev ? `Copiar la serie anterior: ${prevLabel}` : 'Sin serie anterior'} title={prevLabel}>
          {prevText}
        </button>
      )}
      {showWeight && (
        <input className="cell" type="text" inputMode="decimal" value={shown(s.weight)} placeholder={placeholder.weight != null ? fmtKg(placeholder.weight) : ''} onFocus={select} onChange={(e) => update({ weight: num(e.target.value) })} aria-label="Peso en kg" />
      )}
      {isDuration ? (
        <input className="cell" type="text" inputMode="numeric" value={shown(s.durationSec)} placeholder={placeholder.durationSec?.toString() ?? ''} onFocus={select} onChange={(e) => update({ durationSec: num(e.target.value) })} aria-label="Segundos" />
      ) : (
        <input className="cell" type="text" inputMode="numeric" value={shown(s.reps)} placeholder={placeholder.reps?.toString() ?? ''} onFocus={select} onChange={(e) => update({ reps: num(e.target.value) })} aria-label="Repeticiones" />
      )}
      {!isDuration && (
        <select className="cell" value={s.rpe ?? ''} onChange={(e) => update({ rpe: e.target.value ? Number(e.target.value) : undefined })} aria-label="RPE">
          <option value="">–</option>
          {RPE_VALUES.map((r) => <option key={r} value={r}>{String(r).replace('.', ',')}</option>)}
        </select>
      )}
      <button className="check" onClick={toggleDone} aria-label={s.done ? 'Desmarcar serie' : 'Marcar serie como hecha'} aria-pressed={s.done}>
        <Icon name="check" />
      </button>
    </div>
  )
}

const SESSION_RPE: [number, string][] = [
  [1, 'Muy, muy fácil'], [2, 'Fácil'], [3, 'Moderado'], [4, 'Algo duro'], [5, 'Duro'],
  [6, 'Duro'], [7, 'Muy duro'], [8, 'Muy duro'], [9, 'Casi al máximo'], [10, 'Máximo'],
]

function FinishSheet({ workout, metas, sets, exercises, setsDone, volume, onClose, onConfirm }: {
  workout: Workout
  metas: WorkoutExerciseMeta[]
  sets: WorkoutSet[]
  exercises: Map<string, Exercise>
  setsDone: number
  volume: number
  onClose: () => void
  onConfirm: (rpe?: number) => void
}) {
  const [rpe, setRpe] = useState<number | undefined>()
  const now = useNow(10000)
  const minutes = Math.round((now - workout.startedAt) / 60000)
  const results = useLiveQuery(
    () =>
      Promise.all(
        metas.map(async (m) => {
          const ex = exercises.get(m.exerciseId)
          if (!ex) return null
          const [prev] = await exerciseHistory(ex.id, workout.id, 1)
          const mine = sets.filter((s) => s.exerciseOrder === m.exerciseOrder)
          if (!mine.some((s) => s.done)) return null
          return { name: ex.name, verdict: prev ? compareExercise(mine, prev, ex.type) : null }
        }),
      ),
    [metas, sets, exercises, workout.id],
  )
  const loot = useLiveQuery(async () => previewFinish(await loadGameInput(), workout.id!), [sets, metas, workout])
  const rows = (results ?? []).filter((r): r is { name: string; verdict: Verdict | null } => !!r)
  const compared = rows.filter((r) => r.verdict)
  const ups = compared.filter((r) => r.verdict === 'up')
  return (
    <Sheet title="Terminar entreno" onClose={onClose} fit>
      {loot && loot.gained > 0 && (
        <div className="loot" aria-label="Botín del entreno">
          <div className="loot-top">
            <span className="loot-gain">+{loot.gained}</span>
            <span className="lab-label">EXP de este entreno</span>
          </div>
          {loot.levelUp && <p className="level-up">¡Subes a nivel {loot.after.level}!</p>}
          <Meter value={loot.after.progress} label="Experiencia hacia el siguiente nivel" />
          <div className="char-exp" style={{ marginTop: -4 }}>
            <span>NV {loot.after.level}</span>
            <span>{loot.after.into} / {loot.after.need} EXP</span>
          </div>
          <ul className="loot-list">
            {loot.parts.map((p) => <li key={p.label}><span>{p.label}</span><b>+{p.exp}</b></li>)}
            {loot.newFeats.map((f) => <li key={f.id}><span>Hito: {f.title}</span><b>+{EXP.feat}</b></li>)}
          </ul>
          {!workout.notes && <p className="tiny muted">Deja una nota para el entrenador abajo: +{EXP.note} EXP.</p>}
        </div>
      )}
      {compared.length > 0 && (
        <div className="beat-summary">
          <div className="beat-summary-figure"><b>{ups.length}</b><span>/{compared.length}</span></div>
          <div className="grow stack" style={{ gap: 6 }}>
            <p className="beat-summary-title">{ups.length === compared.length ? 'Has superado todos los ejercicios' : ups.length ? `Has superado ${ups.length} de ${compared.length} ejercicios` : 'Hoy no has superado ninguno'}</p>
            <ul className="beat-list">
              {compared.map((r) => (
                <li key={r.name} className={r.verdict!}>
                  <span aria-hidden="true">{r.verdict === 'up' ? '▲' : r.verdict === 'down' ? '▼' : '='}</span> {r.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="figures">
        <Figure value={`${minutes}′`} label="Duración" />
        <Figure value={fmtKg(volume)} label="kg movidos" />
        <Figure value={setsDone} label="Series hechas" />
      </div>
      {setsDone === 0 && <p className="small" style={{ color: 'var(--warn)' }}>No has marcado ninguna serie. Las series sin marcar no se guardan.</p>}
      <div className="stack" style={{ gap: 10 }}>
        <h3 className="h2">¿Cómo de duro ha sido?</h3>
        <p className="small muted">Del 1 al 10. Sirve para seguir tu carga semanal y detectar si acumulas fatiga.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          {SESSION_RPE.map(([v]) => (
            <button key={v} className={`chip num${rpe === v ? ' on' : ''}`} style={{ borderRadius: 'var(--r-md)', minHeight: 48, fontSize: '1.25rem' }} onClick={() => setRpe(rpe === v ? undefined : v)} aria-pressed={rpe === v}>
              {v}
            </button>
          ))}
        </div>
        <p className="small" style={{ minHeight: '1.4em' }}>{rpe ? SESSION_RPE[rpe - 1][1] : <span className="muted">Opcional</span>}</p>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <h3 className="h2">¿Algo para el entrenador?</h3>
        <textarea
          className="field"
          style={{ color: 'var(--ink)' }}
          rows={3}
          placeholder="Cómo te has sentido, qué has cambiado del plan y por qué, molestias, sueño…"
          value={workout.notes ?? ''}
          onChange={(e) => db.workouts.update(workout.id!, { notes: e.target.value || undefined })}
          aria-label="Nota del entreno para el entrenador"
        />
      </div>
      <button className="btn done lg block-w" onClick={() => onConfirm(rpe)}>Guardar entreno</button>
    </Sheet>
  )
}
