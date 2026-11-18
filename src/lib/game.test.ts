import { describe, expect, it } from 'vitest'
import type { Exercise, Routine, Workout, WorkoutSet } from '../types'
import { computeGame, EXP, expForLevel, levelFromExp, mondayOf, previewFinish, streakOf, type GameInput } from './game'

const DAY = 86400000
const EX: Exercise[] = [
  { id: 'press-banca', name: 'Press de banca', primary: 'pecho', secondary: ['triceps'], equipment: 'barra', type: 'weight_reps' },
  { id: 'remo-barra', name: 'Remo con barra', primary: 'espalda_media', secondary: ['biceps'], equipment: 'barra', type: 'weight_reps' },
  { id: 'sentadilla', name: 'Sentadilla', primary: 'cuadriceps', secondary: ['gluteos'], equipment: 'barra', type: 'weight_reps' },
]
const ROUTINES: Routine[] = [{ id: 1, name: 'A · Full body', createdAt: 0, exercises: EX.map((e) => ({ exerciseId: e.id, sets: 3, repMin: 6, repMax: 10, restSec: 120 })) }]

/** Construye un historial: cada sesión = { t, kg por ejercicio, reps por serie }. */
function build(sessions: { t: number; data: Record<string, [number, number[]]>; notes?: string; open?: boolean }[]): GameInput {
  const workouts: Workout[] = []
  const sets: WorkoutSet[] = []
  sessions.forEach((ses, i) => {
    const id = i + 1
    workouts.push({ id, name: 'A · Full body', startedAt: ses.t, endedAt: ses.open ? undefined : ses.t + 3600000, notes: ses.notes, routineId: 1 })
    Object.entries(ses.data).forEach(([ex, [kg, reps]], order) =>
      reps.forEach((r, k) => sets.push({ workoutId: id, exerciseId: ex, exerciseOrder: order, setIndex: k, kind: 'normal', weight: kg, reps: r, done: true })),
    )
  })
  return { workouts, sets, exercises: new Map(EX.map((e) => [e.id, e])), metas: [], routines: ROUTINES }
}

const MON = mondayOf(new Date(2026, 10, 2, 12).getTime()) // lunes 2-11-2026
const base = { 'press-banca': [60, [8, 8, 7]], 'remo-barra': [50, [10, 10, 9]], sentadilla: [80, [8, 8, 8]] } as Record<string, [number, number[]]>

describe('niveles', () => {
  it('curva: 2 a 100, 3 a 300, 4 a 600', () => {
    expect(expForLevel(2)).toBe(100)
    expect(expForLevel(4)).toBe(600)
    expect(levelFromExp(0).level).toBe(1)
    expect(levelFromExp(299).level).toBe(2)
    expect(levelFromExp(300)).toMatchObject({ level: 3, into: 0, need: 300 })
  })
})

describe('EXP por sesión', () => {
  it('la primera sesión da «sesión completa» y el hito de la primera piedra', () => {
    const g = computeGame(build([{ t: MON + 3600000 }].map((s) => ({ ...s, data: base }))), MON + DAY)
    const parts = g.byWorkout.get(1)!.parts.map((p) => p.label)
    expect(parts).toContain('Sesión completa')
    expect(parts).toContain('Hito: Primera piedra')
  })
  it('superar series y ejercicios da EXP; igualar no', () => {
    const better = { ...base, 'press-banca': [60, [9, 8, 7]] as [number, number[]] }
    const g = computeGame(build([{ t: MON, data: base }, { t: MON + 2 * DAY, data: better }]), MON + 3 * DAY)
    const p2 = g.byWorkout.get(2)!.parts
    expect(p2.find((p) => p.label === '1 serie superada')?.exp).toBe(EXP.set)
    expect(p2.find((p) => p.label === '1 ejercicio superado')?.exp).toBe(EXP.exercise)
    expect(p2.find((p) => p.label === 'Semana cumplida')?.exp).toBe(EXP.week)
  })
  it('las series superadas tienen tope por sesión', () => {
    const many = { 'press-banca': [60, Array(20).fill(8)] as [number, number[]] }
    const more = { 'press-banca': [60, Array(20).fill(9)] as [number, number[]] }
    const g = computeGame(build([{ t: MON, data: many }, { t: MON + 2 * DAY, data: more }]), MON + 3 * DAY)
    expect(g.byWorkout.get(2)!.parts.find((p) => p.label.includes('series superadas'))?.exp).toBe(EXP.setCap * EXP.set)
  })
  it('una nota para el entrenador suma', () => {
    const g = computeGame(build([{ t: MON, data: base, notes: 'Dormí poco' }]), MON + DAY)
    expect(g.byWorkout.get(1)!.parts.some((p) => p.label === 'Nota para el entrenador')).toBe(true)
  })
})

describe('la EXP nunca baja con el paso del tiempo', () => {
  it('misiones de semanas pasadas se conservan', () => {
    const better = { ...base, 'press-banca': [62.5, [8, 8, 8]] as [number, number[]] }
    const input = build([{ t: MON - 7 * DAY, data: base }, { t: MON + DAY, data: better }, { t: MON + 3 * DAY, data: better }])
    const during = computeGame(input, MON + 4 * DAY).exp
    const later = computeGame(input, MON + 30 * DAY).exp
    expect(later).toBe(during)
  })
})

describe('racha semanal', () => {
  const weeks = (ns: number[]) => new Map(ns.map((n, i) => [mondayOf(MON + i * 7 * DAY), n]))
  it('cuenta semanas cumplidas seguidas', () => {
    expect(streakOf(weeks([2, 3, 2]), MON + 2 * 7 * DAY + DAY).current).toBe(3)
  })
  it('la semana en curso sin cumplir no rompe la racha', () => {
    expect(streakOf(weeks([2, 2, 1]), MON + 2 * 7 * DAY + DAY).current).toBe(2)
  })
  it('un comodín tapa una semana fallida (Erasmus)', () => {
    expect(streakOf(weeks([2, 2, 0, 2]), MON + 3 * 7 * DAY + DAY).current).toBe(3)
  })
  it('dos semanas fallidas seguidas rompen la racha', () => {
    expect(streakOf(weeks([2, 2, 0, 0, 2]), MON + 4 * 7 * DAY + DAY).current).toBe(1)
  })
})

describe('atributos', () => {
  it('Push sube con el e1RM del press frente al punto de partida', () => {
    const stronger = { ...base, 'press-banca': [66, [8, 8, 7]] as [number, number[]] } // +10 %
    const g = computeGame(build([{ t: MON, data: base }, { t: MON + 2 * DAY, data: stronger }]), MON + 3 * DAY)
    const push = g.attributes.find((a) => a.label === 'Push')!
    expect(push.value).toBe('+10 % e1RM')
    expect(push.level).toBe(5) // 1 + 10 % / 2,5 %
    expect(g.attributes.find((a) => a.label === 'Pull')!.level).toBe(1)
    expect(g.attributes.map((a) => a.label)).toEqual(['Push', 'Pull', 'Legs', 'Posterior', 'Stamina'])
  })
})

describe('botín', () => {
  it('previewFinish da la EXP del entreno en curso y si sube de nivel', () => {
    const better = { ...base, 'press-banca': [60, [9, 9, 8]] as [number, number[]] }
    const input = build([{ t: MON, data: base }, { t: MON + 2 * DAY, data: better, open: true }])
    const p = previewFinish(input, 2, MON + 2 * DAY + 3600000)
    expect(p.gained).toBeGreaterThan(0)
    expect(p.parts.some((x) => x.label === 'Sesión completa')).toBe(true)
    expect(p.after.exp - p.before.exp).toBe(p.gained)
  })
})
