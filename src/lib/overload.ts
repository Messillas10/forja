import type { ExerciseType, WorkoutSet } from '../types'
import { e1rm } from './formulas'

/**
 * Sobrecarga progresiva: comparar cada serie con la misma serie de la sesión anterior.
 *
 * Mismo peso → mandan las repeticiones. Peso distinto → manda el 1RM estimado
 * (Epley/tabla RPE 10, sin el RPE anotado: comparamos rendimiento, no sensaciones),
 * con un margen del 1 % para no llamar «mejora» al ruido de redondeo.
 */
export type Verdict = 'up' | 'equal' | 'down'

export interface SetComparison {
  verdict: Verdict
  /** Texto corto para la etiqueta: «+1 rep», «+2,5 kg», «=», «−2 reps». */
  label: string
  /** Detalle completo cuando cambian peso y reps a la vez («+2,5 kg −1 rep»). */
  detail?: string
}

const EPS = 0.01
const es = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
const signed = (n: number, unit: string) => `${n > 0 ? '+' : '−'}${es(Math.abs(n))} ${unit}`
const reps = (n: number) => signed(n, Math.abs(n) === 1 ? 'rep' : 'reps')

export function compareSet(cur: WorkoutSet, prev: WorkoutSet | undefined, type: ExerciseType): SetComparison | null {
  if (!prev) return null
  if (type === 'duration') {
    const d = (cur.durationSec ?? 0) - (prev.durationSec ?? 0)
    return d > 0 ? { verdict: 'up', label: signed(d, 's') } : d < 0 ? { verdict: 'down', label: signed(d, 's') } : { verdict: 'equal', label: '=' }
  }
  const r = (cur.reps ?? 0) - (prev.reps ?? 0)
  if (type === 'bodyweight_reps') {
    return r > 0 ? { verdict: 'up', label: reps(r) } : r < 0 ? { verdict: 'down', label: reps(r) } : { verdict: 'equal', label: '=' }
  }
  const w = (cur.weight ?? 0) - (prev.weight ?? 0)
  if (Math.abs(w) < 0.001) {
    return r > 0 ? { verdict: 'up', label: reps(r) } : r < 0 ? { verdict: 'down', label: reps(r) } : { verdict: 'equal', label: '=' }
  }
  // Peso distinto: ¿qué serie demuestra más fuerza?
  if (w > 0 && r >= 0) return { verdict: 'up', label: signed(w, 'kg') }
  if (w < 0 && r <= 0) return { verdict: 'down', label: signed(w, 'kg') }
  const a = e1rm(cur.weight ?? 0, cur.reps ?? 0)
  const b = e1rm(prev.weight ?? 0, prev.reps ?? 0)
  // Etiqueta corta con lo que decide: si mejora, lo que subiste; si empeora, lo que perdiste.
  const detail = `${signed(w, 'kg')} ${reps(r)}`
  const gain = w > 0 ? signed(w, 'kg') : reps(r)
  const loss = w > 0 ? reps(r) : signed(w, 'kg')
  if (a > b * (1 + EPS)) return { verdict: 'up', label: gain, detail }
  if (a < b * (1 - EPS)) return { verdict: 'down', label: loss, detail }
  return { verdict: 'equal', label: '=', detail }
}

/**
 * Empareja series por orden dentro de su tipo: la 1.ª de trabajo con la 1.ª de trabajo,
 * el 2.º calentamiento con el 2.º calentamiento… Así añadir calentamientos no desplaza la comparación.
 */
export function matchPrevious(sets: WorkoutSet[], prev: WorkoutSet[]): (WorkoutSet | undefined)[] {
  const isWarm = (s: WorkoutSet) => s.kind === 'warmup'
  const prevWarm = prev.filter(isWarm)
  const prevWork = prev.filter((s) => !isWarm(s))
  let iw = 0
  let ik = 0
  return sets.map((s) => (isWarm(s) ? prevWarm[iw++] : prevWork[ik++]))
}

/**
 * Veredicto de un ejercicio entero (solo series de trabajo hechas).
 * Superado: alguna serie mejora y ninguna empeora. Si hay de todo, decide el total
 * (tonelaje, o repeticiones/segundos si no hay peso).
 * Con menos series de trabajo que la vez anterior no puede contar como superado (como mucho «igual»):
 * así no se gana nada saltándose series, y una semana de 2 días con menos series no sale «por debajo».
 */
export function compareExercise(sets: WorkoutSet[], prev: WorkoutSet[], type: ExerciseType): Verdict | null {
  const doneWork = sets.filter((s) => s.done && s.kind !== 'warmup')
  const prevWork = prev.filter((s) => s.kind !== 'warmup')
  if (!doneWork.length || !prevWork.length) return null
  const matched = matchPrevious(doneWork, prevWork)
  const v = doneWork.map((s, i) => compareSet(s, matched[i], type)?.verdict).filter(Boolean) as Verdict[]
  const ups = v.filter((x) => x === 'up').length
  const downs = v.filter((x) => x === 'down').length
  if (doneWork.length < prevWork.length) return downs && !ups ? 'down' : 'equal'
  if (ups && !downs) return 'up'
  if (downs && !ups) return 'down'
  const total = (l: WorkoutSet[]) =>
    l.reduce((a, s) => a + (type === 'duration' ? s.durationSec ?? 0 : type === 'bodyweight_reps' ? s.reps ?? 0 : (s.weight ?? 0) * (s.reps ?? 0)), 0)
  const a = total(doneWork)
  const b = total(prevWork)
  if (!ups && !downs) return a > b ? 'up' : 'equal'
  return a > b * (1 + EPS) ? 'up' : a < b * (1 - EPS) ? 'down' : 'equal'
}

/** «60 × 8 · 8 · 7» (mismo peso) o «60 × 8 · 62,5 × 6» (pesos distintos). Solo series de trabajo. */
export function formatSession(prev: WorkoutSet[], type: ExerciseType): string {
  const work = prev.filter((s) => s.kind !== 'warmup')
  if (!work.length) return ''
  if (type === 'duration') return work.map((s) => `${s.durationSec ?? 0} s`).join(' · ')
  if (type === 'bodyweight_reps') return `${work.map((s) => s.reps ?? 0).join(' · ')} reps`
  const parts: string[] = []
  let last: number | undefined
  for (const s of work) {
    const w = s.weight ?? 0
    parts.push(w === last ? `${s.reps ?? 0}` : `${es(w)} × ${s.reps ?? 0}`)
    last = w
  }
  return parts.join(' · ')
}
