import { describe, expect, it } from 'vitest'
import type { WorkoutSet } from '../types'
import { compareExercise, compareSet, formatSession, matchPrevious } from './overload'

const s = (weight: number | undefined, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  workoutId: 1, exerciseId: 'x', exerciseOrder: 0, setIndex: 0, kind: 'normal', weight, reps, done: true, ...extra,
})

describe('compareSet', () => {
  it('mismo peso: mandan las reps', () => {
    expect(compareSet(s(60, 9), s(60, 8), 'weight_reps')).toEqual({ verdict: 'up', label: '+1 rep' })
    expect(compareSet(s(60, 8), s(60, 8), 'weight_reps')).toEqual({ verdict: 'equal', label: '=' })
    expect(compareSet(s(60, 6), s(60, 8), 'weight_reps')).toEqual({ verdict: 'down', label: '−2 reps' })
  })
  it('más peso con las mismas reps o más es mejora', () => {
    expect(compareSet(s(62.5, 8), s(60, 8), 'weight_reps')).toEqual({ verdict: 'up', label: '+2,5 kg' })
  })
  it('más peso y menos reps: decide el e1RM', () => {
    // 62,5 × 6 ≈ 74,4 kg frente a 60 × 10 ≈ 80 kg (tabla RPE 10): peor
    expect(compareSet(s(62.5, 6), s(60, 10), 'weight_reps')?.verdict).toBe('down')
    // 65 × 7 ≈ 80,2 frente a 60 × 8 ≈ 74,1: mejor
    expect(compareSet(s(65, 7), s(60, 8), 'weight_reps')).toEqual({ verdict: 'up', label: '+5 kg', detail: '+5 kg −1 rep' })
    expect(compareSet(s(62.5, 6), s(60, 10), 'weight_reps')?.label).toBe('−4 reps')
  })
  it('sin serie anterior no hay veredicto', () => {
    expect(compareSet(s(60, 8), undefined, 'weight_reps')).toBeNull()
  })
  it('peso corporal y duración', () => {
    expect(compareSet(s(undefined, 12), s(undefined, 10), 'bodyweight_reps')?.label).toBe('+2 reps')
    expect(compareSet(s(undefined, 0, { durationSec: 50 }), s(undefined, 0, { durationSec: 45 }), 'duration')?.label).toBe('+5 s')
  })
})

describe('matchPrevious', () => {
  it('los calentamientos no desplazan las series de trabajo', () => {
    const prev = [s(60, 8), s(60, 8)]
    const cur = [s(30, 8, { kind: 'warmup' }), s(60, 9), s(60, 8)]
    const m = matchPrevious(cur, prev)
    expect(m[0]).toBeUndefined()
    expect(m[1]).toBe(prev[0])
    expect(m[2]).toBe(prev[1])
  })
})

describe('compareExercise', () => {
  const prev = [s(60, 8), s(60, 8), s(60, 7)]
  it('superado si mejora alguna y ninguna empeora', () => {
    expect(compareExercise([s(60, 9), s(60, 8), s(60, 7)], prev, 'weight_reps')).toBe('up')
  })
  it('igual si todo coincide', () => {
    expect(compareExercise([s(60, 8), s(60, 8), s(60, 7)], prev, 'weight_reps')).toBe('equal')
  })
  it('mixto: decide el tonelaje', () => {
    expect(compareExercise([s(60, 10), s(60, 8), s(60, 6)], prev, 'weight_reps')).toBe('up')
    expect(compareExercise([s(60, 9), s(60, 6), s(60, 6)], prev, 'weight_reps')).toBe('down')
  })
  it('ignora series sin marcar', () => {
    expect(compareExercise([s(60, 9), s(60, 1, { done: false })], prev, 'weight_reps')).toBe('up')
  })
})

describe('formatSession', () => {
  it('agrupa el peso repetido', () => {
    expect(formatSession([s(20, 10, { kind: 'warmup' }), s(60, 8), s(60, 8), s(62.5, 6)], 'weight_reps')).toBe('60 × 8 · 8 · 62,5 × 6')
  })
})
