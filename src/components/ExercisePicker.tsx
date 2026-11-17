import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '../data/exercises'
import { db } from '../db'
import type { Equipment, Exercise, Muscle } from '../types'
import { initials, Sheet } from './ui'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function useExerciseFilter(exercises: Exercise[] | undefined) {
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<Muscle | null>(null)
  const filtered = useMemo(() => {
    const nq = norm(q.trim())
    return (exercises ?? [])
      .filter((e) => !muscle || e.primary === muscle || e.secondary.includes(muscle))
      .filter((e) => !nq || nq.split(' ').every((t) => norm(`${e.name} ${EQUIPMENT_LABEL[e.equipment]} ${MUSCLE_LABEL[e.primary]}`).includes(t)))
      .sort((a, b) => Number(b.primary === muscle) - Number(a.primary === muscle) || a.name.localeCompare(b.name, 'es'))
  }, [exercises, q, muscle])
  return { q, setQ, muscle, setMuscle, filtered }
}

export function MuscleChips({ value, onChange }: { value: Muscle | null; onChange: (m: Muscle | null) => void }) {
  return (
    <div className="chips">
      <button className={`chip${value == null ? ' on' : ''}`} onClick={() => onChange(null)}>Todos</button>
      {(Object.keys(MUSCLE_LABEL) as Muscle[]).map((m) => (
        <button key={m} className={`chip${value === m ? ' on' : ''}`} onClick={() => onChange(value === m ? null : m)}>
          {MUSCLE_LABEL[m]}
        </button>
      ))}
    </div>
  )
}

export function ExercisePicker({ onClose, onPick }: { onClose: () => void; onPick: (ids: string[]) => void }) {
  const exercises = useLiveQuery(() => db.exercises.toArray())
  const { q, setQ, muscle, setMuscle, filtered } = useExerciseFilter(exercises)
  const [sel, setSel] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <Sheet
      title="Añadir ejercicio"
      onClose={onClose}
      actions={
        <button className="btn primary small" disabled={!sel.length} onClick={() => onPick(sel)}>
          Añadir{sel.length ? ` (${sel.length})` : ''}
        </button>
      }
    >
      <input className="input" placeholder="Buscar ejercicio…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <MuscleChips value={muscle} onChange={setMuscle} />
      <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setCreating(true)}>+ Crear ejercicio personalizado</button>
      <div>
        {filtered.map((e) => (
          <div key={e.id} className={`list-item${sel.includes(e.id) ? ' sel' : ''}`} onClick={() => toggle(e.id)}>
            <div className="avatar">{sel.includes(e.id) ? sel.indexOf(e.id) + 1 : initials(e.name)}</div>
            <div className="grow">
              <div>{e.name}</div>
              <small>{MUSCLE_LABEL[e.primary]} · {EQUIPMENT_LABEL[e.equipment]}</small>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="empty">Sin resultados.</p>}
      </div>
      {creating && (
        <CustomExerciseForm
          initialName={q}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            setSel((s) => [...s, id])
          }}
        />
      )}
    </Sheet>
  )
}

export function CustomExerciseForm({ initialName = '', onClose, onCreated }: { initialName?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState(initialName)
  const [primary, setPrimary] = useState<Muscle>('pecho')
  const [equipment, setEquipment] = useState<Equipment>('barra')
  const [type, setType] = useState<Exercise['type']>('weight_reps')

  async function save() {
    const id = `custom-${Date.now().toString(36)}`
    await db.exercises.add({ id, name: name.trim(), primary, secondary: [], equipment, type, custom: true })
    onCreated(id)
  }

  return (
    <Sheet title="Nuevo ejercicio" onClose={onClose} auto actions={<button className="btn primary small" disabled={!name.trim()} onClick={save}>Guardar</button>}>
      <label className="stack"><small>Nombre</small><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      <label className="stack"><small>Músculo principal</small>
        <select className="input" value={primary} onChange={(e) => setPrimary(e.target.value as Muscle)}>
          {Object.entries(MUSCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="stack"><small>Material</small>
        <select className="input" value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
          {Object.entries(EQUIPMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="stack"><small>Tipo de registro</small>
        <select className="input" value={type} onChange={(e) => setType(e.target.value as Exercise['type'])}>
          <option value="weight_reps">Peso y repeticiones</option>
          <option value="bodyweight_reps">Solo repeticiones</option>
          <option value="weighted_bodyweight">Peso corporal + lastre</option>
          <option value="duration">Tiempo</option>
        </select>
      </label>
    </Sheet>
  )
}
