import { MUSCLE_LABEL } from '../data/exercises'
import { db } from '../db'
import type { Muscle, WorkoutSet } from '../types'
import { e1rm, SECONDARY_MUSCLE_FACTOR, sessionLoad, tonnage } from './formulas'
import { sessionE1rm, workingSets } from './progression'

const DAY = 86400000
const d = (t: number) => new Date(t).toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: '2-digit' })
const dFull = (t: number) => new Date(t).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })
const k = (n: number) => String(Math.round(n * 10) / 10)

function setText(s: WorkoutSet, withWeight: boolean) {
  if (s.durationSec) return `${s.durationSec}s`
  const tag = s.kind === 'drop' ? ' (drop)' : s.kind === 'failure' ? ' (fallo)' : ''
  return `${withWeight ? `${k(s.weight ?? 0)}×` : ''}${s.reps ?? 0}${s.rpe ? ` @${s.rpe}` : ''}${tag}`
}

/**
 * Resumen en texto plano (markdown) pensado para que lo lea un entrenador (humano o Claude).
 * Incluye datos crudos de la semana, tendencias de varias semanas y las rutinas con sus IDs.
 */
export async function buildSummary(days = 7, notes = ''): Promise<string> {
  const now = Date.now()
  const from = now - days * DAY
  const [workouts, sets, exList, routines, weights] = await Promise.all([
    db.workouts.toArray(),
    db.sets.toArray(),
    db.exercises.toArray(),
    db.routines.toArray(),
    db.bodyweights.orderBy('date').toArray(),
  ])
  const exercises = new Map(exList.map((e) => [e.id, e]))
  const finished = workouts.filter((w) => w.endedAt).sort((a, b) => a.startedAt - b.startedAt)
  const inPeriod = finished.filter((w) => w.startedAt >= from)
  const setsBy = (wid: number) => sets.filter((s) => s.workoutId === wid && s.done)
  const out: string[] = []

  out.push(`# Forja · resumen de entrenamiento`)
  out.push(`Periodo: ${dFull(from)} – ${dFull(now)} (${days} días). Generado: ${new Date(now).toLocaleString('es')}.`)
  out.push('')
  out.push('## Comentarios del atleta')
  out.push(notes.trim() || '(sin comentarios)')
  out.push('')

  // Resumen
  const work = inPeriod.flatMap((w) => setsBy(w.id!).filter((s) => s.kind !== 'warmup'))
  const last4w = finished.filter((w) => w.startedAt >= now - 28 * DAY).length
  const mins = inPeriod.map((w) => (w.endedAt! - w.startedAt) / 60000)
  out.push('## Resumen del periodo')
  out.push(`- Entrenos: ${inPeriod.length} (media últimas 4 semanas: ${(last4w / 4).toFixed(1)}/semana; total histórico: ${finished.length})`)
  out.push(`- Series de trabajo: ${work.length} · Volumen: ${Math.round(tonnage(work))} kg`)
  if (mins.length) out.push(`- Duración media: ${Math.round(mins.reduce((a, b) => a + b, 0) / mins.length)} min`)
  const withRpe = inPeriod.filter((w) => w.sessionRpe)
  if (withRpe.length)
    out.push(`- Carga sRPE total: ${Math.round(withRpe.reduce((a, w) => a + sessionLoad(w.sessionRpe!, (w.endedAt! - w.startedAt) / 60000), 0))} UA (RPE sesión medio ${k(withRpe.reduce((a, w) => a + w.sessionRpe!, 0) / withRpe.length)})`)
  out.push('')

  // Sesiones
  out.push('## Sesiones')
  if (!inPeriod.length) out.push('(ninguna en este periodo)')
  for (const w of inPeriod) {
    const ws = setsBy(w.id!).sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setIndex - b.setIndex)
    const extra = [`${Math.round((w.endedAt! - w.startedAt) / 60000)} min`, w.sessionRpe ? `RPE sesión ${w.sessionRpe}` : null].filter(Boolean).join(', ')
    out.push(`### ${d(w.startedAt)} · ${w.name} (${extra})`)
    const orders = [...new Set(ws.map((s) => s.exerciseOrder))]
    for (const o of orders) {
      const group = ws.filter((s) => s.exerciseOrder === o)
      const ex = exercises.get(group[0].exerciseId)
      const hasW = ex?.type === 'weight_reps' || ex?.type === 'weighted_bodyweight'
      const warm = group.filter((s) => s.kind === 'warmup').length
      const main = group.filter((s) => s.kind !== 'warmup')
      const best = hasW && main.length ? ` → e1RM ${k(sessionE1rm(main))}` : ''
      out.push(`- ${ex?.name ?? group[0].exerciseId}: ${main.map((s) => setText(s, hasW)).join(', ')}${warm ? ` (+${warm} calent.)` : ''}${best}`)
    }
  }
  out.push('')

  // Series por músculo
  const muscle = new Map<Muscle, number>()
  for (const s of work) {
    const ex = exercises.get(s.exerciseId)
    if (!ex) continue
    muscle.set(ex.primary, (muscle.get(ex.primary) ?? 0) + 1)
    for (const m of ex.secondary) muscle.set(m, (muscle.get(m) ?? 0) + SECONDARY_MUSCLE_FACTOR)
  }
  out.push(`## Series por músculo en el periodo (secundario ×${SECONDARY_MUSCLE_FACTOR})`)
  out.push(
    (Object.keys(MUSCLE_LABEL) as Muscle[])
      .map((m) => `${MUSCLE_LABEL[m]} ${k(muscle.get(m) ?? 0)}`)
      .join(' · '),
  )
  out.push('')

  // Evolución por ejercicio (ejercicios usados en el periodo)
  out.push('## Evolución por ejercicio (últimas 6 sesiones, de antigua a reciente)')
  const usedIds = [...new Set(work.map((s) => s.exerciseId))]
  for (const id of usedIds) {
    const ex = exercises.get(id)
    const hasW = ex?.type === 'weight_reps' || ex?.type === 'weighted_bodyweight'
    const hist = finished
      .map((w) => ({ w, s: workingSets(setsBy(w.id!).filter((s) => s.exerciseId === id)) }))
      .filter((x) => x.s.length)
      .slice(-6)
    const series = hist.map(({ w, s }) => {
      if (!hasW) return `${new Date(w.startedAt).toLocaleDateString('es', { day: '2-digit', month: '2-digit' })}: ${s.map((x) => setText(x, false)).join('/')}`
      const top = [...s].sort((a, b) => e1rm(b.weight ?? 0, b.reps ?? 0, b.rpe) - e1rm(a.weight ?? 0, a.reps ?? 0, a.rpe))[0]
      return `${new Date(w.startedAt).toLocaleDateString('es', { day: '2-digit', month: '2-digit' })}: ${setText(top, true)} (e1RM ${k(sessionE1rm(s))})`
    })
    out.push(`- ${ex?.name ?? id} [${id}]: ${series.join(' → ')}`)
  }
  out.push('')

  // Peso corporal
  out.push('## Peso corporal')
  if (!weights.length) out.push('(sin registros)')
  else {
    const weeks = new Map<number, number[]>()
    for (const w of weights.filter((x) => x.date >= now - 56 * DAY)) {
      const wk = Math.floor((now - w.date) / (7 * DAY))
      weeks.set(wk, [...(weeks.get(wk) ?? []), w.kg])
    }
    const avg = (l: number[]) => l.reduce((a, b) => a + b, 0) / l.length
    out.push(`- Medias semanales (hace N semanas: media kg [n.º pesajes]): ${[...weeks.entries()].sort((a, b) => b[0] - a[0]).map(([wk, l]) => `${wk}: ${k(avg(l))} [${l.length}]`).join(' · ')}`)
    out.push(`- Últimos registros: ${weights.slice(-8).map((w) => `${dFull(w.date)} ${k(w.kg)}`).join(' · ')}`)
  }
  out.push('')

  // Rutinas
  out.push('## Rutinas actuales en la app (formato: id_ejercicio series×min-max @RPE descanso)')
  for (const r of routines) {
    out.push(`- ${r.name}: ${r.exercises.map((e) => `${e.exerciseId} ${e.sets}×${e.repMin}-${e.repMax}${e.targetRpe ? ` @${e.targetRpe}` : ''} ${e.restSec}s`).join('; ')}`)
  }
  if (!routines.length) out.push('(ninguna)')
  return out.join('\n')
}
