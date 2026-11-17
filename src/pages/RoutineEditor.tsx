import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ExercisePicker } from '../components/ExercisePicker'
import { Icon } from '../components/icons'
import { TopBar } from '../components/ui'
import { db } from '../db'
import { RPE_VALUES } from '../lib/formulas'
import { fmtClock } from '../lib/restTimer'
import type { RoutineExercise } from '../types'

/**
 * Plantillas de rango según objetivo. Fuerza: cargas altas y pocas reps;
 * hipertrofia: rango amplio (6-30 reps) con proximidad al fallo similar (Schoenfeld et al., 2017, JSCR 31(12)).
 */
const PRESETS = {
  Fuerza: { repMin: 3, repMax: 5, targetRpe: 8, restSec: 180 },
  Hipertrofia: { repMin: 8, repMax: 12, targetRpe: 8.5, restSec: 120 },
  Aislamiento: { repMin: 12, repMax: 15, targetRpe: 9, restSec: 90 },
}

export default function RoutineEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'nueva'
  const [name, setName] = useState('')
  const [items, setItems] = useState<RoutineExercise[]>([])
  const [picking, setPicking] = useState(false)
  const exercises = useLiveQuery(() => db.exercises.toArray().then((l) => new Map(l.map((e) => [e.id, e]))))

  useEffect(() => {
    if (isNew) return
    db.routines.get(Number(id)).then((r) => {
      if (!r) return
      setName(r.name)
      setItems(r.exercises)
    })
  }, [id, isNew])

  const patch = (i: number, p: Partial<RoutineExercise>) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...p } : it)))
  const move = (i: number, d: number) =>
    setItems((list) => {
      const j = i + d
      if (j < 0 || j >= list.length) return list
      const copy = [...list]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })

  async function save() {
    const data = { name: name.trim() || 'Rutina sin nombre', exercises: items }
    if (isNew) await db.routines.add({ ...data, createdAt: Date.now() })
    else await db.routines.update(Number(id), data)
    navigate('/')
  }

  const totalSets = items.reduce((a, e) => a + e.sets, 0)

  return (
    <div className="page" style={{ paddingTop: 8 }}>
      <div>
        <TopBar title={isNew ? 'Nueva rutina' : 'Editar rutina'} action={<button className="btn quiet sm" disabled={!items.length} onClick={save}>Guardar</button>} />
        <input className="field display" style={{ fontSize: '1.5rem', border: 0, padding: 0, background: 'transparent', minHeight: 56 }} placeholder="Nombre, p. ej. A · Full body" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre de la rutina" />
        {items.length > 0 && <p className="small muted">{items.length} ejercicios, {totalSets} series, unos {Math.round(totalSets * 2.75 + 10)} min</p>}
      </div>

      {items.map((it, i) => {
        const ex = exercises?.get(it.exerciseId)
        return (
          <section key={`${it.exerciseId}-${i}`} className="exercise">
            <div className="exercise-head">
              <div className="exercise-name grow">{ex?.name ?? it.exerciseId}</div>
              <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir"><Icon name="up" /></button>
              <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Bajar"><Icon name="down" /></button>
              <button className="icon-btn" style={{ color: 'var(--danger)' }} onClick={() => setItems((l) => l.filter((_, j) => j !== i))} aria-label="Quitar"><Icon name="close" /></button>
            </div>
            <div className="chips" style={{ margin: 0, padding: 0 }}>
              {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
                <button key={k} className="chip" onClick={() => patch(i, PRESETS[k])}>{k}</button>
              ))}
            </div>
            <div className="settings">
              <label>Series<input className="cell" type="number" inputMode="numeric" value={it.sets} onChange={(e) => patch(i, { sets: Math.max(1, +e.target.value) })} /></label>
              <label>Rango de reps
                <span className="range">
                  <input className="cell" type="number" inputMode="numeric" value={it.repMin} onChange={(e) => patch(i, { repMin: +e.target.value })} aria-label="Mínimo" />–
                  <input className="cell" type="number" inputMode="numeric" value={it.repMax} onChange={(e) => patch(i, { repMax: +e.target.value })} aria-label="Máximo" />
                </span>
              </label>
              <label>RPE objetivo
                <select className="cell" value={it.targetRpe ?? ''} onChange={(e) => patch(i, { targetRpe: e.target.value ? +e.target.value : undefined })}>
                  <option value="">Sin RPE</option>
                  {RPE_VALUES.map((r) => <option key={r} value={r}>{String(r).replace('.', ',')}</option>)}
                </select>
              </label>
              <label>Descanso
                <select className="cell" value={it.restSec} onChange={(e) => patch(i, { restSec: +e.target.value })}>
                  {[30, 45, 60, 90, 120, 150, 180, 240, 300].map((s) => <option key={s} value={s}>{fmtClock(s)}</option>)}
                </select>
              </label>
            </div>
          </section>
        )
      })}

      {items.length === 0 && <p className="muted">Añade los ejercicios en el orden en que los harás.</p>}
      <button className="btn ink lg block-w" onClick={() => setPicking(true)}><Icon name="plus" />Añadir ejercicios</button>
      {!isNew && (
        <button
          className="btn danger"
          onClick={async () => {
            if (confirm('¿Borrar esta rutina? Tu historial no se borra.')) {
              await db.routines.delete(Number(id))
              navigate('/')
            }
          }}
        >
          Borrar rutina
        </button>
      )}
      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={(ids) => {
            setPicking(false)
            setItems((l) => [...l, ...ids.map((exerciseId) => ({ exerciseId, sets: 3, ...PRESETS.Hipertrofia }))])
          }}
        />
      )}
    </div>
  )
}
