import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/icons'
import { TopBar } from '../components/ui'
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
      setMsg('')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg('Este navegador no deja compartir. Usa Descargar o Copiar.')
    }
  }
  function download() {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    a.download = fileName
    a.click()
    URL.revokeObjectURL(a.href)
    setMsg('Resumen descargado.')
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setMsg('Resumen copiado.')
    } catch {
      setMsg('No se pudo copiar. Usa Descargar.')
    }
  }

  return (
    <div className="page" style={{ paddingTop: 8 }}>
      <div>
        <TopBar />
        <h1 className="display title">Entrenador</h1>
        <p className="small muted" style={{ marginTop: 6 }}>Cada semana envías tus datos, el entrenador los analiza y te devuelve los ajustes de tus rutinas.</p>
      </div>

      <section className="section">
        <h2 className="h2">1. Envía tu semana</h2>
        <label className="stack small muted">
          Lo que no se ve en los números
          <textarea className="field" rows={4} style={{ color: 'var(--ink)' }} placeholder="Partido el sábado. Molestia en el isquio derecho. Dormí poco el miércoles." value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="segmented" role="group" aria-label="Periodo">
          {[7, 14, 28].map((n) => (
            <button key={n} className={days === n ? 'on' : undefined} aria-pressed={days === n} onClick={() => setDays(n)}>{n} días</button>
          ))}
        </div>
        <button className="btn primary lg block-w" onClick={share} disabled={!text}><Icon name="share" />Compartir resumen</button>
        <div className="row">
          <button className="btn outline grow" onClick={download}>Descargar</button>
          <button className="btn outline grow" onClick={copy}>Copiar</button>
        </div>
        {msg && <p className="small" role="status">{msg}</p>}
        <p className="tiny muted">En el menú de compartir, elige «Guardar en Drive»: el entrenador lo encuentra solo.</p>
        <details>
          <summary>Ver lo que se envía</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', color: 'var(--steel)', fontFamily: 'inherit', fontStretch: '85%' }}>{text}</pre>
        </details>
      </section>

      <section className="section">
        <h2 className="h2">2. Importa sus ajustes</h2>
        <p className="small muted">Abre el enlace o escanea el QR que te dé el entrenador. También puedes pegarlo aquí.</p>
        <input className="field" placeholder="Pega el enlace" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Enlace de rutinas" />
        <button className="btn ink block-w" disabled={!code.trim()} onClick={() => navigate(`/importar/${encodeURIComponent(code.trim().split('/importar/').pop()!)}`)}>Revisar rutinas</button>
      </section>
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
    decodeRoutines(code ?? '').then(setRoutines).catch(() => setError('Este enlace no es válido o está cortado. Pide al entrenador que lo genere de nuevo.'))
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

  if (error) return <div className="page"><TopBar back="/" /><div className="empty"><h1 className="display title">Enlace no válido</h1><p>{error}</p></div></div>
  if (!routines || !exercises) return null
  const unknown = routines.flatMap((r) => r.exercises).filter((e) => !exercises.has(e.exerciseId))

  return (
    <div className="page" style={{ paddingTop: 8, paddingBottom: 'calc(40px + var(--safe-b))' }}>
      <div>
        <TopBar back="/" />
        <h1 className="display title">Rutinas nuevas</h1>
        <p className="small muted" style={{ marginTop: 6 }}>Revísalas antes de importarlas.</p>
      </div>
      {routines.map((r) => (
        <section key={r.name} className="section">
          <h2 className="h2">{r.name}</h2>
          <table className="data">
            <thead><tr><th>Ejercicio</th><th>Series</th><th>Reps</th><th>Desc.</th></tr></thead>
            <tbody>
              {r.exercises.map((e, i) => (
                <tr key={i} style={exercises.has(e.exerciseId) ? undefined : { color: 'var(--danger)' }}>
                  <td style={{ fontStretch: '100%' }}>{exercises.get(e.exerciseId) ?? `${e.exerciseId} (no existe)`}</td>
                  <td className="strong">{e.sets}</td>
                  <td>{e.repMin}–{e.repMax}</td>
                  <td>{e.restSec >= 60 ? `${Math.floor(e.restSec / 60)}:${String(e.restSec % 60).padStart(2, '0')}` : `${e.restSec}s`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {unknown.length > 0 && <p className="small" style={{ color: 'var(--warn)' }}>Los ejercicios en rojo no están en tu catálogo y no se importarán.</p>}
      <label className="row small" style={{ gap: 10 }}>
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--ember)' }} />
        Sustituir las rutinas que se llamen igual
      </label>
      <button className="btn primary lg block-w" onClick={doImport}>Importar {routines.length} {routines.length === 1 ? 'rutina' : 'rutinas'}</button>
    </div>
  )
}
