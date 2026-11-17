/**
 * Fórmulas de entrenamiento de fuerza con respaldo en la literatura.
 * Cada función cita su fuente. Ver docs/DISENO.md para el detalle.
 */

// ───────────────────────── 1RM estimado ─────────────────────────

export type OneRmFormula = 'epley' | 'brzycki' | 'lombardi' | 'mayhew' | 'oconner' | 'wathan' | 'lander'

/**
 * Ecuaciones de predicción de 1RM a partir de una serie submáxima llevada al fallo (o cerca).
 * Validez: mejor precisión entre 1 y ~10 repeticiones (LeSuer et al., 1997, JSCR 11(4):211-213).
 */
export const ONE_RM_FORMULAS: Record<OneRmFormula, { label: string; ref: string; fn: (w: number, r: number) => number }> = {
  epley: { label: 'Epley', ref: 'Epley, 1985', fn: (w, r) => w * (1 + r / 30) },
  brzycki: { label: 'Brzycki', ref: 'Brzycki, 1993, JOPERD 64(1)', fn: (w, r) => (w * 36) / (37 - r) },
  lombardi: { label: 'Lombardi', ref: 'Lombardi, 1989', fn: (w, r) => w * Math.pow(r, 0.1) },
  mayhew: {
    label: 'Mayhew',
    ref: 'Mayhew et al., 1992, JAPS 6(4)',
    fn: (w, r) => (100 * w) / (52.2 + 41.9 * Math.exp(-0.055 * r)),
  },
  oconner: { label: "O'Conner", ref: "O'Conner et al., 1989", fn: (w, r) => w * (1 + 0.025 * r) },
  wathan: {
    label: 'Wathan',
    ref: 'Wathan, 1994',
    fn: (w, r) => (100 * w) / (48.8 + 53.8 * Math.exp(-0.075 * r)),
  },
  lander: { label: 'Lander', ref: 'Lander, 1985', fn: (w, r) => (100 * w) / (101.3 - 2.67123 * r) },
}

/** 1RM estimado con una fórmula concreta. Con 1 repetición devuelve el propio peso. */
export function oneRm(weight: number, reps: number, formula: OneRmFormula = 'epley'): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
  return ONE_RM_FORMULAS[formula].fn(weight, reps)
}

/** Media de todas las fórmulas: reduce el sesgo individual de cada ecuación. */
export function oneRmConsensus(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
  const keys = Object.keys(ONE_RM_FORMULAS) as OneRmFormula[]
  return keys.reduce((acc, k) => acc + ONE_RM_FORMULAS[k].fn(weight, reps), 0) / keys.length
}

// ───────────────────────── RPE / RIR ─────────────────────────

/**
 * Tabla %1RM por repeticiones y RPE (escala RIR de Zourdos et al., 2016, JSCR 30(1):267-275;
 * tabla de Tuchscherer / Helms et al., 2016, Strength Cond J 38(4):42-49).
 * La tabla es una única secuencia: cada media unidad de RPE desplaza un paso,
 * igual que una repetición más equivale a dos pasos.
 */
const RPE_SEQUENCE = [
  100, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6, 77.4, 76.2, 75.1,
  73.9, 72.3, 70.7, 69.4, 68.0, 66.7, 65.3, 64.0, 62.6, 61.3, 59.9, 58.6, 57.3,
]

export const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]

/** % del 1RM (0-1) que corresponde a hacer `reps` repeticiones con un RPE dado. */
export function rpePercent(reps: number, rpe: number): number | null {
  if (reps < 1 || reps > 12 || rpe < 6 || rpe > 10) return null
  const idx = Math.round((reps - 1) * 2 + (10 - rpe) * 2)
  const v = RPE_SEQUENCE[idx]
  return v === undefined ? null : v / 100
}

/** Repeticiones en reserva implicadas por un RPE (RIR = 10 − RPE). */
export const rirFromRpe = (rpe: number) => 10 - rpe

/**
 * 1RM estimado de una serie con RPE. Si no hay RPE, asume fallo (RPE 10) con Epley.
 * Fuera de rango (>12 reps) usa Epley sumando las repeticiones en reserva.
 */
export function e1rm(weight: number, reps: number, rpe?: number): number {
  if (!weight || !reps) return 0
  if (rpe != null) {
    const p = rpePercent(reps, rpe)
    if (p) return weight / p
    return oneRm(weight, reps + rirFromRpe(rpe), 'epley')
  }
  return reps <= 12 ? weight / (rpePercent(reps, 10) ?? 1) : oneRm(weight, reps, 'epley')
}

/** Carga objetivo para hacer `reps` repeticiones a un RPE dado partiendo de un e1RM. */
export function loadForTarget(e1rmKg: number, reps: number, rpe: number): number {
  const p = rpePercent(reps, rpe) ?? 1 / (1 + (reps + rirFromRpe(rpe)) / 30)
  return e1rmKg * p
}

// ───────────────────────── Volumen e intensidad ─────────────────────────

/** Volumen-carga (tonelaje): Σ peso × repeticiones. */
export const tonnage = (sets: { weight?: number; reps?: number }[]) =>
  sets.reduce((acc, s) => acc + (s.weight ?? 0) * (s.reps ?? 0), 0)

/**
 * Rango de series efectivas semanales por grupo muscular.
 * Schoenfeld, Ogborn & Krieger, 2017 (J Sports Sci 35(11)): ≥10 series/semana → mayor hipertrofia.
 * Pelland et al., 2024 (SportRxiv, meta-regresión): beneficio decreciente a partir de ~20,
 * y cómputo fraccional (músculo secundario = 0,5 series).
 */
export const WEEKLY_SETS_TARGET = { min: 10, max: 20 }
export const SECONDARY_MUSCLE_FACTOR = 0.5

/**
 * INOL (Hristov, 2005): reps / (100 − %1RM). Heurística de entrenador (no revisada por pares)
 * para dosificar intensidad × volumen. Por ejercicio y sesión: <0.4 poco, 0.4-1 óptimo, >1 duro, >2 excesivo.
 */
export function inol(reps: number, pct1rm: number): number {
  const pct = pct1rm * 100
  if (pct >= 100) return reps // tope: evita división por 0
  return reps / (100 - pct)
}

// ───────────────────────── Carga interna / fatiga ─────────────────────────

/** Carga de sesión (Foster et al., 2001, JSCR 15(1):109-115): RPE de sesión × minutos. */
export const sessionLoad = (sessionRpe: number, minutes: number) => sessionRpe * minutes

/**
 * Ratio carga aguda:crónica con medias móviles exponenciales
 * (Williams et al., 2017, Br J Sports Med 51(3):209-210; concepto de Gabbett, 2016, BJSM 50(5)).
 * Zona 0,8-1,3 considerada "segura"; >1,5 pico de carga. Advertencia: su valor predictivo de lesión
 * está cuestionado (Impellizzeri et al., 2020, IJSPP 15(6)), úsese solo como indicador de tendencia.
 * @param dailyLoads carga por día, del más antiguo al más reciente (0 si no se entrenó).
 */
export function acwrEwma(dailyLoads: number[]): { acute: number; chronic: number; ratio: number | null } {
  const la = 2 / (7 + 1)
  const lc = 2 / (28 + 1)
  let acute = 0
  let chronic = 0
  for (const load of dailyLoads) {
    acute = load * la + (1 - la) * acute
    chronic = load * lc + (1 - lc) * chronic
  }
  return { acute, chronic, ratio: chronic > 0 ? acute / chronic : null }
}

// ───────────────────────── Utilidades de carga ─────────────────────────

export function roundTo(value: number, step: number): number {
  if (step <= 0) return value
  return Math.round(value / step) * step
}

export const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25]

/** Discos por lado para cargar una barra. `remainder` > 0 si no es exacto. */
export function platesPerSide(total: number, bar = 20, plates = DEFAULT_PLATES) {
  let side = (total - bar) / 2
  const result: number[] = []
  if (side < 0) return { plates: result, remainder: side * 2 }
  for (const p of plates) {
    while (side >= p - 1e-9) {
      result.push(p)
      side -= p
    }
  }
  return { plates: result, remainder: Math.round(side * 2 * 100) / 100 }
}

/**
 * Series de aproximación hasta la carga de trabajo (práctica habitual en la NSCA:
 * volumen decreciente e intensidad creciente, sin acumular fatiga).
 */
export function warmupSets(workWeight: number, step = 2.5, bar = 20): { weight: number; reps: number }[] {
  if (workWeight <= bar * 1.25) return [{ weight: roundTo(workWeight * 0.5, step), reps: 10 }]
  const scheme: [number, number][] = [
    [0, 10],
    [0.4, 5],
    [0.6, 3],
    [0.8, 2],
  ]
  const out: { weight: number; reps: number }[] = []
  for (const [pct, reps] of scheme) {
    const w = pct === 0 ? bar : Math.max(bar, roundTo(workWeight * pct, step))
    if (out.length && out[out.length - 1].weight === w) continue
    if (w >= workWeight) break
    out.push({ weight: w, reps })
  }
  return out
}
