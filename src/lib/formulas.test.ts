import { describe, expect, it } from 'vitest'
import type { Exercise, WorkoutSet } from '../types'
import { acwrEwma, e1rm, inol, loadForTarget, oneRm, oneRmConsensus, platesPerSide, rpePercent, warmupSets } from './formulas'
import { suggestNext } from './progression'

describe('1RM', () => {
  it('Epley y Brzycki coinciden a 10 reps (propiedad conocida)', () => {
    expect(oneRm(100, 10, 'epley')).toBeCloseTo(133.33, 1)
    expect(oneRm(100, 10, 'brzycki')).toBeCloseTo(133.33, 1)
  })
  it('1 repetición = el propio peso', () => {
    expect(oneRm(140, 1, 'mayhew')).toBe(140)
    expect(oneRmConsensus(140, 1)).toBe(140)
  })
  it('el consenso queda dentro del rango de las fórmulas', () => {
    const c = oneRmConsensus(100, 5)
    expect(c).toBeGreaterThan(110)
    expect(c).toBeLessThan(120)
  })
})

describe('tabla RPE', () => {
  it('valores de referencia de la tabla de Tuchscherer', () => {
    expect(rpePercent(1, 10)).toBe(1)
    expect(rpePercent(2, 10)).toBeCloseTo(0.955, 6)
    expect(rpePercent(1, 9.5)).toBeCloseTo(0.978, 6)
    expect(rpePercent(9, 9)).toBeCloseTo(0.739, 6)
    expect(rpePercent(12, 6)).toBeCloseTo(0.573, 6)
    expect(rpePercent(13, 8)).toBeNull()
  })
  it('e1RM e inversa son coherentes', () => {
    const est = e1rm(100, 5, 8)
    expect(est).toBeCloseTo(100 / 0.811, 2)
    expect(loadForTarget(est, 5, 8)).toBeCloseTo(100, 5)
  })
})

describe('utilidades', () => {
  it('discos por lado', () => {
    expect(platesPerSide(100).plates).toEqual([25, 15])
    expect(platesPerSide(62.5).plates).toEqual([20, 1.25])
    expect(platesPerSide(61).remainder).toBeCloseTo(1, 5)
  })
  it('calentamiento ascendente y por debajo del peso de trabajo', () => {
    const w = warmupSets(140)
    expect(w[0].weight).toBe(20)
    expect(w.every((s, i) => i === 0 || s.weight > w[i - 1].weight)).toBe(true)
    expect(w.every((s) => s.weight < 140)).toBe(true)
  })
  it('INOL', () => {
    expect(inol(5, 0.8)).toBeCloseTo(0.25)
  })
  it('ACWR estable ≈ 1 con carga constante', () => {
    const r = acwrEwma(Array(120).fill(300)).ratio!
    expect(r).toBeCloseTo(1, 2)
  })
})

describe('progresión', () => {
  const bench: Exercise = { id: 'b', name: 'Banca', primary: 'pecho', secondary: [], equipment: 'barra', type: 'weight_reps' }
  const mk = (weight: number, reps: number[], rpe?: number): WorkoutSet[] =>
    reps.map((r, i) => ({ workoutId: 1, exerciseId: 'b', exerciseOrder: 0, setIndex: i, kind: 'normal', weight, reps: r, rpe, done: true }))

  it('doble progresión: sube cuando todas las series llegan al tope', () => {
    const s = suggestNext(bench, [mk(80, [10, 10, 10])], { repMin: 6, repMax: 10 })!
    expect(s.action).toBe('subir')
    expect(s.weight).toBe(82.5)
    expect(s.reps).toBe(6)
  })
  it('doble progresión: mantiene y suma reps', () => {
    const s = suggestNext(bench, [mk(80, [10, 9, 8])], { repMin: 6, repMax: 10 })!
    expect(s.action).toBe('mantener')
    expect(s.weight).toBe(80)
    expect(s.reps).toBe(9)
  })
  it('doble progresión: baja si cae del mínimo', () => {
    const s = suggestNext(bench, [mk(80, [7, 5, 4])], { repMin: 6, repMax: 10 })!
    expect(s.action).toBe('bajar')
    expect(s.weight).toBe(75)
  })
  it('RPE: prescribe por e1RM', () => {
    const s = suggestNext(bench, [mk(100, [5], 7)], { repMin: 5, repMax: 5, targetRpe: 8 })!
    expect(s.method).toBe('rpe')
    expect(s.weight).toBeGreaterThan(100)
  })
  it('rango amplio con RPE: doble progresión, el RPE solo frena', () => {
    const ok = suggestNext(bench, [mk(80, [10, 10, 10], 8)], { repMin: 6, repMax: 10, targetRpe: 8.5 })!
    expect(ok.method).toBe('doble')
    expect(ok.action).toBe('subir')
    const hard = suggestNext(bench, [mk(80, [10, 10, 10], 10)], { repMin: 6, repMax: 10, targetRpe: 8.5 })!
    expect(hard.action).toBe('mantener')
    expect(hard.weight).toBe(80)
  })
  it('descarga cuando el e1RM cae 3 sesiones seguidas', () => {
    const hist = [mk(80, [6]), mk(80, [7]), mk(80, [8]), mk(80, [9])]
    const s = suggestNext(bench, hist, { repMin: 6, repMax: 10 })!
    expect(s.action).toBe('descarga')
    expect(s.weight).toBe(72.5)
  })
})
