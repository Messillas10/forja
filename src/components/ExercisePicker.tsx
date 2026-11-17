import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '../data/exercises'
import { db } from '../db'
import type { Equipment, Exercise, Muscle } from '../types'
import { Icon } from './icons'
import { Sheet } from './ui'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function useExerciseFilter(exercises: Exercise[] | undefined) {
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<Muscle | null>(null)
  const filtered = useMemo(() => {
    const nq = norm(q.trim())
    return (exercises ?? [])
      .filter((e) => !muscle || e.primary === muscle || e.secondary.includes(muscle))
      .filter((e) => !nq || nq.split(/\s+/).every((t) => norm(`${e.name} ${EQUIPMENT_LABEL[e.equipment]} ${MUSCLE_LABEL[e.primary]}`).includes(t)))
      .sort((a, b) => Number(b.primary === muscle) - Number(a.primary === muscle) || a.name.localeCompare(b.name, 'es'))
  }, [exercises, q, muscle])
  return { q, setQ, muscle, setMuscle, filtered }
}

export function exerciseMeta(e: Exercise) {
  return `${MUSCLE_LABEL[e.primary]}, ${EQUIPMENT_LABEL[e.equipment].toLowerCase()}`
}

export function MuscleChips({ value, onChange }: { value: Muscle | null; onChange: (m: Muscle | null) => void }) {
  return (
    <div className="chips" role="group" aria-label="Filtrar por músculo">
      <button className={`chip${value == null ? ' on' : ''}`} onClick={() => onChange(null)} aria-pressed={value == null}>Todos</button>
      {(Object.keys(MUSCLE_LABEL) as Muscle[]).map((m) => (
        <button key={m} className={`chip${value === m ? ' on' : ''}`} onClick={() => onChange(value === m ? null : m)} aria-pressed={value === m}>
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
    <Sheet title="Añadir ejercicios" onClose={onClose}>
      <input className="field search" type="search" placeholder="Buscar: press, remo, polea…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ejercicio" />
      <MuscleChips value={muscle} onChange={setMuscle} />
      <div className="list">
        {filtered.map((e) => {
          const pos = sel.indexOf(e.id)
          return (
            <button key={e.id} className={`list-row${pos >= 0 ? ' selected' : ''}`} onClick={() => toggle(e.id)} aria-pressed={pos >= 0}>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{e.name}</div>
                <div className="tiny muted">{exerciseMeta(e)}</div>
              </div>
              {pos >= 0 && <span className="num" style={{ color: 'var(--ember)', fontSize: '1.25rem' }} aria-hidden="true">{pos + 1}</span>}
            </button>
          )
        })}
        {filtered.length === 0 && (
          <div className="list-row"><span className="muted">Ningún ejercicio coincide. Créalo abajo.</span></div>
        )}
      </div>
      <button className="btn outline" onClick={() => setCreating(true)}><Icon name="plus" />Crear ejercicio{q.trim() ? ` «${q.trim()}»` : ''}</button>
      <div style={{ position: 'sticky', bottom: 0, paddingTop: 8, background: 'var(--bg)' }}>
        <button className="btn primary lg block-w" disabled={!sel.length} onClick={() => onPick(sel)}>
          {sel.length ? `Añadir ${sel.length} ${sel.length === 1 ? 'ejercicio' : 'ejercicios'}` : 'Elige uno o varios'}
        </button>
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
    <Sheet title="Nuevo ejercicio" onClose={onClose} fit>
      <label className="stack small muted">Nombre<input className="field" value={name} onChange={(e) => setName(e.target.value)} style={{ color: 'var(--ink)' }} /></label>
      <label className="stack small muted">Músculo principal
        <select className="field" value={primary} onChange={(e) => setPrimary(e.target.value as Muscle)} style={{ color: 'var(--ink)' }}>
          {Object.entries(MUSCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="stack small muted">Material
        <select className="field" value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)} style={{ color: 'var(--ink)' }}>
          {Object.entries(EQUIPMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="stack small muted">Qué se apunta
        <select className="field" value={type} onChange={(e) => setType(e.target.value as Exercise['type'])} style={{ color: 'var(--ink)' }}>
          <option value="weight_reps">Peso y repeticiones</option>
          <option value="bodyweight_reps">Solo repeticiones</option>
          <option value="weighted_bodyweight">Peso corporal más lastre</option>
          <option value="duration">Tiempo</option>
        </select>
      </label>
      <button className="btn primary lg" disabled={!name.trim()} onClick={save}>Crear ejercicio</button>
    </Sheet>
  )
}
