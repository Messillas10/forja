import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ExercisePicker } from '../components/ExercisePicker'
import { db } from '../db'
import { RPE_VALUES } from '../lib/formulas'
import { fmtClock } from '../lib/restTimer'
import type { RoutineExercise } from '../types'

/**
 * Plantillas de rango según objetivo. Fuerza: cargas altas y pocas reps;
 * hipertrofia: rango amplio (6-30 reps) con proximidad al fallo similar (Schoenfeld et al., 2017, JSCR 31(12)).
 */
const PRESETS = {
  fuerza: { repMin: 3, repMax: 5, targetRpe: 8, restSec: 180 },
  hipertrofia: { repMin: 8, repMax: 12, targetRpe: 8, restSec: 120 },
  aislamiento: { repMin: 12, repMax: 15, targetRpe: 9, restSec: 90 },
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
    const data = { name: name.trim() || 'Rutina', exercises: items }
    if (isNew) await db.routines.add({ ...data, createdAt: Date.now() })
    else await db.routines.update(Number(id), data)
    navigate('/')
  }

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn ghost small" onClick={() => navigate(-1)}>Cancelar</button>
        <h2>{isNew ? 'Nueva rutina' : 'Editar rutina'}</h2>
        <button className="btn primary small" disabled={!items.length} onClick={save}>Guardar</button>
      </div>
      <input className="input" placeholder="Nombre (p. ej. Torso A)" value={name} onChange={(e) => setName(e.target.value)} />
      {items.map((it, i) => {
        const ex = exercises?.get(it.exerciseId)
        return (
          <div key={`${it.exerciseId}-${i}`} className="card">
            <div className="row between">
              <span className="ex-title">{ex?.name ?? it.exerciseId}</span>
              <div className="row">
                <button className="btn small" onClick={() => move(i, -1)} aria-label="Subir">↑</button>
                <button className="btn small" onClick={() => move(i, 1)} aria-label="Bajar">↓</button>
                <button className="btn small danger" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} aria-label="Quitar">✕</button>
              </div>
            </div>
            <div className="chips">
              {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
                <button key={k} className="chip" onClick={() => patch(i, PRESETS[k])}>{k}</button>
              ))}
            </div>
            <div className="row wrap" style={{ gap: 12 }}>
              <label className="row">Series <input className="cell" type="number" inputMode="numeric" value={it.sets} onChange={(e) => patch(i, { sets: Math.max(1, +e.target.value) })} /></label>
              <label className="row">Reps <input className="cell" type="number" inputMode="numeric" value={it.repMin} onChange={(e) => patch(i, { repMin: +e.target.value })} />–<input className="cell" type="number" inputMode="numeric" value={it.repMax} onChange={(e) => patch(i, { repMax: +e.target.value })} /></label>
              <label className="row">RPE
                <select className="cell rpe" value={it.targetRpe ?? ''} onChange={(e) => patch(i, { targetRpe: e.target.value ? +e.target.value : undefined })}>
                  <option value="">–</option>
                  {RPE_VALUES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label className="row">Descanso
                <select className="cell" style={{ maxWidth: 80 }} value={it.restSec} onChange={(e) => patch(i, { restSec: +e.target.value })}>
                  {[30, 45, 60, 90, 120, 150, 180, 240, 300].map((s) => <option key={s} value={s}>{fmtClock(s)}</option>)}
                </select>
              </label>
            </div>
          </div>
        )
      })}
      <button className="btn block" onClick={() => setPicking(true)}>+ Añadir ejercicios</button>
      {!isNew && (
        <button
          className="btn danger block"
          onClick={async () => {
            if (confirm('¿Borrar esta rutina?')) {
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
            setItems((l) => [...l, ...ids.map((exerciseId) => ({ exerciseId, sets: 3, ...PRESETS.hipertrofia }))])
          }}
        />
      )}
    </div>
  )
}
