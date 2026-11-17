export type Muscle =
  | 'pecho'
  | 'dorsales'
  | 'espalda_media'
  | 'trapecio'
  | 'lumbares'
  | 'hombro_anterior'
  | 'hombro_lateral'
  | 'hombro_posterior'
  | 'biceps'
  | 'triceps'
  | 'antebrazo'
  | 'cuadriceps'
  | 'isquios'
  | 'gluteos'
  | 'aductores'
  | 'gemelos'
  | 'abdominales'
  | 'oblicuos'

export type Equipment =
  | 'barra'
  | 'mancuerna'
  | 'maquina'
  | 'polea'
  | 'peso_corporal'
  | 'kettlebell'
  | 'barra_z'
  | 'banda'
  | 'smith'

/**
 * weight_reps: carga externa × repeticiones (press banca)
 * bodyweight_reps: solo repeticiones (flexiones)
 * weighted_bodyweight: peso corporal + lastre (dominadas lastradas)
 * duration: tiempo (plancha)
 */
export type ExerciseType = 'weight_reps' | 'bodyweight_reps' | 'weighted_bodyweight' | 'duration'

export interface Exercise {
  id: string
  name: string
  primary: Muscle
  secondary: Muscle[]
  equipment: Equipment
  type: ExerciseType
  /** Incremento mínimo de carga en kg (para redondear sugerencias). */
  increment?: number
  /** Movimiento de tren inferior / multiarticular grande: progresa con saltos mayores. */
  lowerBody?: boolean
  custom?: boolean
}

export type SetKind = 'normal' | 'warmup' | 'drop' | 'failure'

export interface Workout {
  id?: number
  name: string
  startedAt: number
  endedAt?: number
  routineId?: number
  notes?: string
  /** RPE de sesión (Foster 2001), 1-10. */
  sessionRpe?: number
}

export interface WorkoutSet {
  id?: number
  workoutId: number
  exerciseId: string
  /** Orden del ejercicio dentro del entrenamiento. */
  exerciseOrder: number
  setIndex: number
  kind: SetKind
  weight?: number
  reps?: number
  rpe?: number
  durationSec?: number
  done: boolean
  completedAt?: number
}

export interface RoutineExercise {
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  targetRpe?: number
  restSec: number
}

export interface Routine {
  id?: number
  name: string
  exercises: RoutineExercise[]
  createdAt: number
}

/** Configuración de ejercicio dentro de un entrenamiento activo (objetivos, descanso). */
export interface WorkoutExerciseMeta {
  id?: number
  workoutId: number
  exerciseId: string
  exerciseOrder: number
  repMin?: number
  repMax?: number
  targetRpe?: number
  restSec: number
}

export interface BodyWeight {
  id?: number
  /** Marca de tiempo de la medición. */
  date: number
  kg: number
}
