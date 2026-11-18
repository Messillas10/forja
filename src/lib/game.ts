import type { Exercise, Muscle, Routine, Workout, WorkoutExerciseMeta, WorkoutSet } from '../types'
import { compareExercise, compareSet, matchPrevious } from './overload'
import { sessionE1rm, workingSets } from './progression'

/**
 * Capa de juego de Forja (y de Kepler, que importa este mismo módulo).
 *
 * Regla de oro: solo da experiencia por lo que la evidencia dice que funciona
 * — progresar frente a la vez anterior, ser constante semana a semana, contarle al entrenador
 * cómo vas — y nunca por volumen de relleno. Todo se recalcula desde el historial: no hay
 * puntos guardados aparte que puedan desincronizarse.
 */

// ───────────────────────── Reglas ─────────────────────────

export const EXP = {
  /** Cada serie de trabajo que supera a la misma serie de la vez anterior. */
  set: 5,
  /** Tope de series que cuentan por sesión (para no premiar series de relleno). */
  setCap: 12,
  /** Ejercicio superado en conjunto. */
  exercise: 15,
  /** Sesión completa (al menos `sessionMinSets` series de trabajo). */
  session: 30,
  sessionMinSets: 4,
  /** Nota para el entrenador en la sesión. */
  note: 10,
  /** Semana cumplida (≥ `weekMinSessions` entrenos). */
  week: 50,
  weekMinSessions: 2,
  /** Misión semanal cumplida. */
  mission: 20,
  /** Hito desbloqueado. */
  feat: 25,
} as const

/** EXP total para llegar al nivel L (nivel 1 = 0, 2 = 100, 3 = 300, 4 = 600…). */
export const expForLevel = (level: number) => 50 * level * (level - 1)

export function levelFromExp(exp: number) {
  let level = 1
  while (expForLevel(level + 1) <= exp) level++
  const base = expForLevel(level)
  const need = expForLevel(level + 1) - base
  return { level, into: exp - base, need, progress: (exp - base) / need }
}

/** Atributos de fuerza: grupo de cada ejercicio según su músculo principal. */
export type StrengthAttr = 'empuje' | 'tiron' | 'pierna' | 'posterior'
/** Nombres en inglés, como en un juego (elegido por el usuario). */
export const ATTR_LABEL: Record<StrengthAttr, string> = { empuje: 'Push', tiron: 'Pull', pierna: 'Legs', posterior: 'Posterior' }
const ATTR_OF: Partial<Record<Muscle, StrengthAttr>> = {
  pecho: 'empuje', hombro_anterior: 'empuje', hombro_lateral: 'empuje', triceps: 'empuje',
  dorsales: 'tiron', espalda_media: 'tiron', trapecio: 'tiron', hombro_posterior: 'tiron', biceps: 'tiron', antebrazo: 'tiron',
  cuadriceps: 'pierna', aductores: 'pierna', gemelos: 'pierna',
  isquios: 'posterior', gluteos: 'posterior', lumbares: 'posterior',
}
/** Cada +2,5 % de e1RM medio frente a tu punto de partida = +1 nivel de atributo. */
export const ATTR_STEP = 0.025

// ───────────────────────── Tipos ─────────────────────────

export interface ExpPart { label: string; exp: number }
export interface Feat { id: string; title: string; desc: string; at?: number }
export interface Mission { id: string; title: string; detail: string; done: boolean; progress?: [number, number]; exp: number }
export interface Attribute {
  id: StrengthAttr | 'constancia'
  label: string
  level: number
  /** 0-1 hacia el siguiente nivel. */
  progress: number
  /** Texto con la cifra real («+7 % e1RM», «5 semanas»). */
  value: string
  /** Ejercicios que lo forman (solo fuerza). */
  basis?: string[]
}
export interface GameState {
  exp: number
  level: number
  into: number
  need: number
  progress: number
  attributes: Attribute[]
  streak: { current: number; best: number; weeksMet: number; thisWeek: number; jokerUsed: boolean }
  feats: Feat[]
  missions: Mission[]
  /** EXP ganada en cada entreno terminado, con su desglose. */
  byWorkout: Map<number, { exp: number; parts: ExpPart[] }>
}

export interface GameInput {
  workouts: Workout[]
  sets: WorkoutSet[]
  exercises: Map<string, Exercise>
  metas: WorkoutExerciseMeta[]
  routines: Routine[]
}

// ───────────────────────── Utilidades ─────────────────────────

const DAY = 86400000
export function mondayOf(t: number) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}
const weekKey = (t: number) => mondayOf(t)
const nextWeek = (monday: number) => mondayOf(monday + 8 * DAY)

const FEATS: Omit<Feat, 'at'>[] = [
  { id: 'primera', title: 'Primera piedra', desc: 'Termina tu primer entreno.' },
  { id: 'superado', title: 'Por encima de ayer', desc: 'Supera un ejercicio frente a la vez anterior.' },
  { id: 'semana', title: 'Semana cumplida', desc: `Entrena ${EXP.weekMinSessions} veces en una semana.` },
  { id: 'diario', title: 'Cuaderno de laboratorio', desc: 'Deja notas al entrenador en 5 entrenos.' },
  { id: 'diez', title: 'Diez sesiones', desc: 'Termina 10 entrenos.' },
  { id: 'pleno', title: 'Pleno', desc: 'Supera todos los ejercicios de una sesión (mínimo 3).' },
  { id: 'racha4', title: 'Un mes sin fallar', desc: 'Cumple 4 semanas seguidas.' },
  { id: 'e1rm10', title: 'Mejora medible', desc: '+10 % de e1RM en un ejercicio.' },
  { id: 'veinticinco', title: 'Veinticinco sesiones', desc: 'Termina 25 entrenos.' },
  { id: 'racha8', title: 'Dos meses de constancia', desc: 'Cumple 8 semanas seguidas.' },
  { id: 'e1rm25', title: 'Salto de nivel', desc: '+25 % de e1RM en un ejercicio.' },
  { id: 'cincuenta', title: 'Medio centenar', desc: 'Termina 50 entrenos.' },
]

/** Grupo de rotación de una rutina: «A · Full body» → «A». */
const groupOf = (name: string) => {
  const first = name.trim().split(/\s+/)[0]
  return first.length <= 2 ? first.toUpperCase() : name
}

// ───────────────────────── Motor ─────────────────────────

export function computeGame(input: GameInput, now = Date.now()): GameState {
  const { exercises, metas } = input
  const finished = input.workouts.filter((w) => w.endedAt != null).sort((a, b) => a.startedAt - b.startedAt)
  const setsByWorkout = new Map<number, WorkoutSet[]>()
  for (const s of input.sets) {
    if (!setsByWorkout.has(s.workoutId)) setsByWorkout.set(s.workoutId, [])
    setsByWorkout.get(s.workoutId)!.push(s)
  }
  const notedWorkout = (w: Workout) => !!w.notes?.trim() || metas.some((m) => m.workoutId === w.id && m.notes?.trim())

  let exp = 0
  const byWorkout = new Map<number, { exp: number; parts: ExpPart[] }>()
  const feats = new Map<string, number>()
  const unlock = (id: string, at: number, parts?: ExpPart[]) => {
    if (feats.has(id)) return
    feats.set(id, at)
    exp += EXP.feat
    parts?.push({ label: `Hito: ${FEATS.find((f) => f.id === id)!.title}`, exp: EXP.feat })
  }
  /** Última sesión de cada ejercicio (series), para comparar. */
  const lastSets = new Map<string, WorkoutSet[]>()
  /** e1RM de la primera sesión y la mejor reciente, por ejercicio con carga. */
  const baseline = new Map<string, number>()
  const e1rmLog = new Map<string, { t: number; v: number }[]>()
  let noted = 0
  const sessionsPerWeek = new Map<number, number>()

  for (const w of finished) {
    const ws = setsByWorkout.get(w.id!) ?? []
    const parts: ExpPart[] = []
    let gained = 0
    const add = (label: string, n: number) => {
      if (!n) return
      parts.push({ label, exp: n })
      gained += n
    }
    const orders = [...new Set(ws.map((s) => s.exerciseOrder))].sort((a, b) => a - b)
    let beaten = 0
    let exUp = 0
    let compared = 0
    for (const o of orders) {
      const group = ws.filter((s) => s.exerciseOrder === o).sort((a, b) => a.setIndex - b.setIndex)
      const ex = exercises.get(group[0].exerciseId)
      if (!ex || !group.some((s) => s.done)) continue
      const prev = lastSets.get(ex.id)
      if (prev) {
        const done = group.filter((s) => s.done && s.kind !== 'warmup')
        const matched = matchPrevious(done, prev.filter((s) => s.kind !== 'warmup'))
        beaten += done.filter((s, i) => compareSet(s, matched[i], ex.type)?.verdict === 'up').length
        const v = compareExercise(group, prev, ex.type)
        if (v) compared++
        if (v === 'up') exUp++
      }
      lastSets.set(ex.id, group.filter((s) => s.done))
      if (ex.type === 'weight_reps' || ex.type === 'weighted_bodyweight') {
        const v = sessionE1rm(group)
        if (v > 0) {
          if (!baseline.has(ex.id)) baseline.set(ex.id, v)
          if (!e1rmLog.has(ex.id)) e1rmLog.set(ex.id, [])
          e1rmLog.get(ex.id)!.push({ t: w.startedAt, v })
          const ratio = v / baseline.get(ex.id)!
          if (ratio >= 1.1) unlock('e1rm10', w.startedAt, parts)
          if (ratio >= 1.25) unlock('e1rm25', w.startedAt, parts)
        }
      }
    }
    const counted = Math.min(beaten, EXP.setCap)
    add(`${counted} ${counted === 1 ? 'serie superada' : 'series superadas'}`, counted * EXP.set)
    add(`${exUp} ${exUp === 1 ? 'ejercicio superado' : 'ejercicios superados'}`, exUp * EXP.exercise)
    if (workingSets(ws).length >= EXP.sessionMinSets) add('Sesión completa', EXP.session)
    if (notedWorkout(w)) {
      add('Nota para el entrenador', EXP.note)
      noted++
    }
    // Semana
    const wk = weekKey(w.startedAt)
    const n = (sessionsPerWeek.get(wk) ?? 0) + 1
    sessionsPerWeek.set(wk, n)
    if (n === EXP.weekMinSessions) add('Semana cumplida', EXP.week)
    exp += gained
    // Hitos
    const count = byWorkout.size + 1
    unlock('primera', w.startedAt, parts)
    if (exUp > 0) unlock('superado', w.startedAt, parts)
    if (n >= EXP.weekMinSessions) unlock('semana', w.startedAt, parts)
    if (noted >= 5) unlock('diario', w.startedAt, parts)
    if (count >= 10) unlock('diez', w.startedAt, parts)
    if (count >= 25) unlock('veinticinco', w.startedAt, parts)
    if (count >= 50) unlock('cincuenta', w.startedAt, parts)
    if (compared >= 3 && exUp === compared) unlock('pleno', w.startedAt, parts)
    // Rachas (para los hitos de racha, calculadas hasta esta sesión)
    const st = streakOf(sessionsPerWeek, w.startedAt)
    if (st.current >= 4) unlock('racha4', w.startedAt, parts)
    if (st.current >= 8) unlock('racha8', w.startedAt, parts)
    byWorkout.set(w.id!, { exp: parts.reduce((a, p) => a + p.exp, 0), parts })
  }

  // Misiones de la semana (se fijan con lo hecho antes del lunes, para que no cambien a mitad de semana)
  // Se suman también las de semanas pasadas, para que la EXP nunca baje al cambiar de semana.
  const monday = mondayOf(now)
  let missions: Mission[] = []
  if (finished.length) {
    for (let wk = mondayOf(finished[0].startedAt); wk <= monday; wk = nextWeek(wk)) {
      const inWeek = finished.filter((w) => w.startedAt >= wk && w.startedAt < nextWeek(wk))
      const ms = weeklyMissions(input, finished, setsByWorkout, wk, inWeek)
      for (const m of ms) if (m.done) exp += m.exp
      if (wk === monday) missions = ms
    }
  }
  if (!missions.length) missions = weeklyMissions(input, finished, setsByWorkout, monday, [])

  const lv = levelFromExp(exp)
  const streak = streakOf(sessionsPerWeek, now)

  // Atributos de fuerza: media del cambio de e1RM (mejor de las últimas 4 semanas, o la última) frente a la primera sesión
  const attributes: Attribute[] = (Object.keys(ATTR_LABEL) as StrengthAttr[]).map((a) => {
    const ids = [...e1rmLog.keys()].filter((id) => ATTR_OF[exercises.get(id)!.primary] === a)
    const ratios = ids.map((id) => {
      const log = e1rmLog.get(id)!
      const recent = log.filter((x) => x.t >= now - 28 * DAY)
      const cur = recent.length ? Math.max(...recent.map((x) => x.v)) : log[log.length - 1].v
      return cur / baseline.get(id)!
    })
    const gain = ratios.length ? ratios.reduce((x, y) => x + y, 0) / ratios.length - 1 : 0
    const steps = Math.max(0, gain) / ATTR_STEP + 1e-9 // margen para que 66/60 cuente como +10 % exacto
    const pct = Math.round(gain * 100)
    return {
      id: a,
      label: ATTR_LABEL[a],
      level: 1 + Math.floor(steps),
      progress: steps - Math.floor(steps),
      value: ratios.length ? `${pct >= 0 ? '+' : '−'}${Math.abs(pct)} % e1RM` : 'sin datos',
      basis: ids.map((id) => exercises.get(id)!.name),
    }
  })
  attributes.push({
    id: 'constancia',
    label: 'Stamina',
    level: 1 + streak.weeksMet,
    progress: Math.min(1, streak.thisWeek / EXP.weekMinSessions),
    value: `${streak.weeksMet} ${streak.weeksMet === 1 ? 'semana cumplida' : 'semanas cumplidas'}`,
  })

  return {
    exp,
    ...lv,
    attributes,
    streak,
    feats: FEATS.map((f) => ({ ...f, at: feats.get(f.id) })),
    missions,
    byWorkout,
  }
}

/**
 * Racha de semanas cumplidas hasta la semana de `t`. La semana en curso solo suma si ya está cumplida
 * (si no, aún estás a tiempo y no rompe nada). Un comodín cada 4 semanas tapa una semana fallida
 * (viajes, exámenes): pensado para el Erasmus.
 */
export function streakOf(perWeek: Map<number, number>, t: number) {
  const met = (wk: number) => (perWeek.get(wk) ?? 0) >= EXP.weekMinSessions
  const weeks = [...perWeek.keys()].sort((a, b) => a - b)
  const current0 = mondayOf(t)
  let current = 0
  let best = 0
  let weeksMet = 0
  let lastJoker = -Infinity
  let jokerUsed = false
  if (weeks.length) {
    let i = 0
    for (let wk = weeks[0]; wk <= current0; wk = nextWeek(wk), i++) {
      if (met(wk)) {
        current++
        weeksMet++
      } else if (wk === current0) {
        // semana en curso sin cumplir todavía: no suma ni rompe
      } else if (i - lastJoker >= 4 && current > 0) {
        lastJoker = i
        jokerUsed = wk >= current0 - 21 * DAY
      } else {
        current = 0
      }
      best = Math.max(best, current)
    }
  }
  return { current, best, weeksMet, thisWeek: perWeek.get(current0) ?? 0, jokerUsed }
}

/**
 * Misiones de la semana. Mientras el entrenador (Kepler) no proponga otras:
 * 1. Cumplir la semana.
 * 2-3. Superar el ejercicio principal (el primero) de dos rutinas, rotando cada semana.
 */
function weeklyMissions(
  input: GameInput,
  finished: Workout[],
  setsByWorkout: Map<number, WorkoutSet[]>,
  monday: number,
  thisWeek: Workout[],
): Mission[] {
  const missions: Mission[] = [
    {
      id: 'semana',
      title: 'Cumple la semana',
      detail: `${EXP.weekMinSessions} entrenos (3 si puedes)`,
      done: thisWeek.length >= EXP.weekMinSessions,
      progress: [Math.min(thisWeek.length, EXP.weekMinSessions), EXP.weekMinSessions],
      exp: 0, // la EXP ya la da «Semana cumplida»
    },
  ]
  const before = finished.filter((w) => w.startedAt < monday)
  const lastBefore = (exId: string) => {
    for (let i = before.length - 1; i >= 0; i--) {
      const s = (setsByWorkout.get(before[i].id!) ?? []).filter((x) => x.exerciseId === exId && x.done)
      if (s.length) return s
    }
    return null
  }
  // Ejercicio principal de cada grupo de rutinas (A, B, C), sin repetir
  const groups = [...new Set(input.routines.map((r) => groupOf(r.name)))].sort((a, b) => a.localeCompare(b, 'es'))
  const mains: string[] = []
  for (const g of groups) {
    const r = input.routines.filter((x) => groupOf(x.name) === g).sort((a, b) => a.name.length - b.name.length)[0]
    const first = r?.exercises.find((e) => {
      const ex = input.exercises.get(e.exerciseId)
      return ex && (ex.type === 'weight_reps' || ex.type === 'weighted_bodyweight') && !mains.includes(ex.id) && lastBefore(ex.id)
    })
    if (first) mains.push(first.exerciseId)
  }
  const rot = Math.floor(monday / (7 * DAY))
  const picks = mains.length <= 2 ? mains : [mains[rot % mains.length], mains[(rot + 1) % mains.length]]
  for (const id of picks) {
    const ex = input.exercises.get(id)!
    const ref = lastBefore(id)!
    const done = thisWeek.some((w) => {
      const s = (setsByWorkout.get(w.id!) ?? []).filter((x) => x.exerciseId === id)
      return s.length > 0 && compareExercise(s, ref, ex.type) === 'up'
    })
    const work = ref.filter((s) => s.kind !== 'warmup')
    const best = work.reduce((a, s) => ((s.weight ?? 0) > (a.weight ?? 0) ? s : a), work[0])
    missions.push({
      id: `supera-${id}`,
      title: `Supera ${ex.name.toLowerCase()}`,
      detail: `Última: ${work.map((s) => s.reps).join(' · ')} reps con ${String(best?.weight ?? 0).replace('.', ',')} kg`,
      done,
      exp: EXP.mission,
    })
  }
  return missions
}

/** EXP y desglose que daría el entreno en curso si se terminara ahora (para el «botín»). */
export function previewFinish(input: GameInput, workoutId: number, now = Date.now()) {
  const before = computeGame(input, now)
  const after = computeGame({ ...input, workouts: input.workouts.map((w) => (w.id === workoutId ? { ...w, endedAt: now } : w)) }, now)
  const gained = after.exp - before.exp
  const parts = after.byWorkout.get(workoutId)?.parts ?? []
  const missionParts: ExpPart[] = after.missions
    .filter((m) => m.done && m.exp && !before.missions.find((b) => b.id === m.id)?.done)
    .map((m) => ({ label: `Misión: ${m.title}`, exp: m.exp }))
  const newFeats = after.feats.filter((f) => f.at && !before.feats.find((b) => b.id === f.id)?.at)
  return { before, after, gained, parts: [...parts.filter((p) => !p.label.startsWith('Hito')), ...missionParts], newFeats, levelUp: after.level > before.level }
}
