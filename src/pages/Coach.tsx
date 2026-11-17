import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db'
import { decodeRoutines } from '../lib/routineShare'
import { buildSummary } from '../lib/summary'
import type { Routine } from '../types'

const NOTES_KEY = 'forja.coachNotes'
const readNotes = () => {
  try {
    return localStorage.getItem(NOTES_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Genera el resumen semanal y lo comparte (Drive, Telegram, correo…) para el entrenador. */
export default function Coach() {
  const navigate = useNavigate()
  const [notes, setNotes] = useState(readNotes)
  const [days, setDays] = useState(7)
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const [code, setCode] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem(NOTES_KEY, notes)
    } catch {
      /* ignorar */
    }
  }, [notes])

  // Se regenera al cambiar datos, días o notas.
  const dataVersion = useLiveQuery(async () => `${await db.sets.count()}-${await db.workouts.count()}-${await db.bodyweights.count()}`)
  useEffect(() => {
    buildSummary(days, notes).then(setText)
  }, [days, notes, dataVersion])

  const fileName = `forja-resumen-${new Date().toISOString().slice(0, 10)}.txt`

  async function share() {
    const file = new File([text], fileName, { type: 'text/plain' })
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Resumen Forja' })
      else if (navigator.share) await navigator.share({ title: 'Resumen Forja', text })
      else download()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg('No se pudo compartir; usa Descargar o Copiar.')
    }
  }
  function download() {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    a.download = fileName
    a.click()
    URL.revokeObjectURL(a.href)
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setMsg('Copiado.')
    } catch {
      setMsg('No se pudo copiar.')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn ghost small" onClick={() => navigate(-1)}>← Volver</button>
      </div>
      <h1>Entrenador</h1>
      <div className="card">
        <h3>1. Enviar resumen</h3>
        <small>Cuéntale lo que no ve en los números: partidos, molestias, sueño, estrés, días que no pudiste ir…</small>
        <textarea className="input" rows={4} placeholder="Ej.: partido el sábado; algo de carga en el isquio derecho; dormí poco el miércoles." value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="chips">
          {[7, 14, 28].map((n) => (
            <button key={n} className={`chip${days === n ? ' on' : ''}`} onClick={() => setDays(n)}>Últimos {n} días</button>
          ))}
        </div>
        <button className="btn primary block" onClick={share} disabled={!text}>Compartir resumen</button>
        <div className="row">
          <button className="btn grow" onClick={download}>Descargar</button>
          <button className="btn grow" onClick={copy}>Copiar</button>
        </div>
        {msg && <small>{msg}</small>}
        <details>
          <summary className="muted" style={{ cursor: 'pointer' }}>Ver lo que se envía</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', color: 'var(--text-2)' }}>{text}</pre>
        </details>
      </div>
      <div className="card">
        <h3>2. Importar rutinas del entrenador</h3>
        <small>Abre el enlace que te dé el entrenador, o pégalo aquí.</small>
        <input className="input" placeholder="Pega el enlace o el código" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn block" disabled={!code.trim()} onClick={() => navigate(`/importar/${encodeURIComponent(code.trim().split('/importar/').pop()!)}`)}>Revisar e importar</button>
      </div>
    </div>
  )
}

export function ImportRoutines() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [routines, setRoutines] = useState<Pick<Routine, 'name' | 'exercises'>[] | null>(null)
  const [error, setError] = useState('')
  const [replace, setReplace] = useState(true)
  const exercises = useLiveQuery(() => db.exercises.toArray().then((l) => new Map(l.map((e) => [e.id, e.name]))))

  useEffect(() => {
    decodeRoutines(code ?? '').then(setRoutines).catch(() => setError('El enlace no es válido o está incompleto.'))
  }, [code])

  async function doImport() {
    if (!routines || !exercises) return
    await db.transaction('rw', db.routines, async () => {
      for (const r of routines) {
        const clean = { ...r, exercises: r.exercises.filter((e) => exercises.has(e.exerciseId)) }
        const existing = replace ? await db.routines.where('name').equals(r.name).first() : undefined
        if (existing) await db.routines.update(existing.id!, { exercises: clean.exercises })
        else await db.routines.add({ ...clean, createdAt: Date.now() })
      }
    })
    navigate('/', { replace: true })
  }

  if (error) return <div className="page"><p className="empty">{error}</p><button className="btn" onClick={() => navigate('/')}>Volver</button></div>
  if (!routines || !exercises) return null
  const unknown = routines.flatMap((r) => r.exercises).filter((e) => !exercises.has(e.exerciseId))

  return (
    <div className="page">
      <h1>Importar rutinas</h1>
      {routines.map((r) => (
        <div key={r.name} className="card">
          <b>{r.name}</b>
          <table className="plain">
            <thead><tr><th>Ejercicio</th><th>Series</th><th>Reps</th><th>RPE</th><th>Desc.</th></tr></thead>
            <tbody>
              {r.exercises.map((e, i) => (
                <tr key={i} style={exercises.has(e.exerciseId) ? undefined : { color: 'var(--danger)' }}>
                  <td>{exercises.get(e.exerciseId) ?? `${e.exerciseId} (no existe)`}</td>
                  <td>{e.sets}</td>
                  <td>{e.repMin}–{e.repMax}</td>
                  <td>{e.targetRpe ?? '–'}</td>
                  <td>{e.restSec}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {unknown.length > 0 && <small style={{ color: 'var(--warn)' }}>Los ejercicios en rojo no existen en tu catálogo y se omitirán.</small>}
      <label className="row"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Reemplazar las rutinas que tengan el mismo nombre</label>
      <button className="btn primary block" onClick={doImport}>Importar {routines.length} rutina{routines.length > 1 ? 's' : ''}</button>
      <button className="btn ghost block" onClick={() => navigate('/')}>Cancelar</button>
    </div>
  )
}
