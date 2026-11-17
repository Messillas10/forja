import type { Exercise, WorkoutSet } from '../types'
import { e1rm, loadForTarget, roundTo } from './formulas'

export interface Target {
  repMin: number
  repMax: number
  targetRpe?: number
}

export interface Suggestion {
  weight: number
  reps: number
  rpe?: number
  method: 'rpe' | 'doble' | 'inicial'
  action: 'subir' | 'mantener' | 'bajar' | 'descarga' | 'nuevo'
  reason: string
}

/** Número en formato español con un decimal como máximo. */
const es = (n: number) => n.toLocaleString('es', { maximumFractionDigits: 1 })

export function incrementFor(ex: Exercise): number {
  if (ex.increment) return ex.increment
  switch (ex.equipment) {
    case 'mancuerna':
    case 'kettlebell':
      return 2
    case 'maquina':
    case 'polea':
      return 2.5
    default:
      return ex.lowerBody ? 5 : 2.5
  }
}

/** Series de trabajo (sin calentamiento) completadas con peso y reps. */
export function workingSets(sets: WorkoutSet[]) {
  return sets.filter((s) => s.done && s.kind !== 'warmup' && (s.reps ?? 0) > 0)
}

/** Mejor e1RM de una sesión. */
export function sessionE1rm(sets: WorkoutSet[]): number {
  return Math.max(0, ...workingSets(sets).map((s) => e1rm(s.weight ?? 0, s.reps ?? 0, s.rpe)))
}

/**
 * Sugerencia de carga para la próxima sesión.
 *
 * 1. Detección de estancamiento: si el e1RM cae en 3 sesiones consecutivas → descarga del 10 %
 *    (consenso Delphi sobre descargas: Bell et al., 2023, Sports Medicine - Open).
 * 2. Autorregulación por RPE (Helms et al., 2018, Front Physiol 9:247): con objetivo de reps casi fijo
 *    (rango ≤ 2, p. ej. 5×5 @8) y RPE registrado, se calcula el e1RM de la mejor serie y se prescribe
 *    la carga para las reps/RPE objetivo.
 * 3. Doble progresión (rangos amplios, p. ej. 8-12): se sube la carga cuando todas las series llegan al
 *    tope del rango; se mantiene mientras se progresa en reps; se baja ~5 % si se cae por debajo del mínimo.
 *    Si hay RPE objetivo, actúa de freno: no se sube si las series fueron más duras de lo previsto.
 *
 * @param history sesiones anteriores de este ejercicio, de la más reciente a la más antigua.
 */
export function suggestNext(ex: Exercise, history: WorkoutSet[][], target: Target): Suggestion | null {
  const step = incrementFor(ex)
  const sessions = history.map(workingSets).filter((s) => s.length > 0)
  const last = sessions[0]
  const targetReps = target.repMax

  if (ex.type === 'duration' || ex.type === 'bodyweight_reps') {
    if (!last) return null
    const bestReps = Math.max(...last.map((s) => s.reps ?? 0))
    const allTop = last.every((s) => (s.reps ?? 0) >= target.repMax)
    return {
      weight: 0,
      reps: allTop ? bestReps + 1 : bestReps,
      method: 'doble',
      action: allTop ? 'subir' : 'mantener',
      reason: allTop ? 'Llegaste al tope del rango: intenta +1 repetición.' : 'Repite y busca completar el rango.',
    }
  }

  if (!last) return null

  // 1. Estancamiento
  if (sessions.length >= 4) {
    const trend = sessions.slice(0, 4).map(sessionE1rm)
    if (trend[0] < trend[1] && trend[1] < trend[2] && trend[2] < trend[3]) {
      const w = roundTo((last[0].weight ?? 0) * 0.9, step)
      return {
        weight: w,
        reps: target.repMin,
        rpe: target.targetRpe ? Math.max(6, target.targetRpe - 2) : undefined,
        method: 'rpe',
        action: 'descarga',
        reason: 'El e1RM ha bajado 3 sesiones seguidas: semana de descarga (−10 %, lejos del fallo).',
      }
    }
  }

  // 2. Autorregulación por RPE
  const withRpe = last.filter((s) => s.rpe != null)
  if (target.targetRpe && withRpe.length > 0 && target.repMax - target.repMin <= 2) {
    const best = Math.max(...withRpe.map((s) => e1rm(s.weight ?? 0, s.reps ?? 0, s.rpe)))
    const w = roundTo(loadForTarget(best, targetReps, target.targetRpe), step)
    const prev = last[0].weight ?? 0
    return {
      weight: w,
      reps: targetReps,
      rpe: target.targetRpe,
      method: 'rpe',
      action: w > prev ? 'subir' : w < prev ? 'bajar' : 'mantener',
      reason: `Máximo estimado ${es(best)} kg: ${targetReps} reps a RPE ${es(target.targetRpe)}.`,
    }
  }

  // 3. Doble progresión
  const weight = Math.max(...last.map((s) => s.weight ?? 0))
  const top = last.filter((s) => (s.weight ?? 0) === weight)
  const allAtMax = top.every((s) => (s.reps ?? 0) >= target.repMax)
  const anyBelowMin = top.some((s) => (s.reps ?? 0) < target.repMin)
  const tooHard = target.targetRpe != null && top.some((s) => (s.rpe ?? 0) > target.targetRpe! + 0.5)

  if (allAtMax && !tooHard) {
    return {
      weight: weight + step,
      reps: target.repMin,
      method: 'doble',
      action: 'subir',
      reason: `Todas las series a ${target.repMax} reps: +${es(step)} kg y vuelve a ${target.repMin} reps.`,
    }
  }
  if (allAtMax && tooHard) {
    return {
      weight,
      reps: target.repMax,
      rpe: target.targetRpe,
      method: 'doble',
      action: 'mantener',
      reason: `Llegaste a ${target.repMax} reps pero más cerca del fallo que el RPE ${es(target.targetRpe!)} objetivo: repite el peso y consolida.`,
    }
  }
  if (anyBelowMin) {
    return {
      weight: roundTo(weight * 0.95, step),
      reps: target.repMin,
      method: 'doble',
      action: 'bajar',
      reason: `Por debajo de ${target.repMin} reps: baja ~5 % y reconstruye.`,
    }
  }
  const minReps = Math.min(...top.map((s) => s.reps ?? 0))
  return {
    weight,
    reps: Math.min(target.repMax, minReps + 1),
    method: 'doble',
    action: 'mantener',
    reason: `Mismo peso, suma reps hasta ${target.repMax} en todas las series.`,
  }
}
