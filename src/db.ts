import Dexie, { type EntityTable } from 'dexie'
import { SEED_EXERCISES } from './data/exercises'
import type { Exercise, Routine, Workout, WorkoutExerciseMeta, WorkoutSet } from './types'

export const db = new Dexie('forja') as Dexie & {
  exercises: EntityTable<Exercise, 'id'>
  workouts: EntityTable<Workout, 'id'>
  sets: EntityTable<WorkoutSet, 'id'>
  routines: EntityTable<Routine, 'id'>
  workoutExercises: EntityTable<WorkoutExerciseMeta, 'id'>
}

db.version(1).stores({
  exercises: 'id, name, primary, equipment',
  workouts: '++id, startedAt, endedAt',
  sets: '++id, workoutId, exerciseId, [workoutId+exerciseOrder], [exerciseId+workoutId]',
  routines: '++id, name',
  workoutExercises: '++id, workoutId, [workoutId+exerciseOrder]',
})

db.on('populate', (tx) => {
  tx.table('exercises').bulkAdd(SEED_EXERCISES)
})

/** Añade ejercicios de la base que falten (cuando se amplía el catálogo en una actualización). */
export async function syncSeedExercises() {
  const existing = new Set(await db.exercises.toCollection().primaryKeys())
  const missing = SEED_EXERCISES.filter((e) => !existing.has(e.id))
  if (missing.length) await db.exercises.bulkAdd(missing)
}

/** Entrenamiento en curso (sin fecha de fin). */
export async function getActiveWorkout(): Promise<Workout | undefined> {
  return db.workouts.filter((w) => w.endedAt == null).first()
}

/**
 * Sesiones anteriores terminadas de un ejercicio (más reciente primero),
 * cada una como lista de series.
 */
export async function exerciseHistory(exerciseId: string, beforeWorkoutId?: number, limit = 10): Promise<WorkoutSet[][]> {
  const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray()
  const workoutIds = [...new Set(sets.map((s) => s.workoutId))].filter((id) => id !== beforeWorkoutId)
  const workouts = (await db.workouts.bulkGet(workoutIds)).filter((w): w is Workout => !!w && w.endedAt != null)
  workouts.sort((a, b) => b.startedAt - a.startedAt)
  return workouts.slice(0, limit).map((w) => sets.filter((s) => s.workoutId === w.id).sort((a, b) => a.setIndex - b.setIndex))
}

export async function startWorkout(routine?: Routine): Promise<number> {
  const active = await getActiveWorkout()
  if (active) return active.id!
  return db.transaction('rw', db.workouts, db.sets, db.workoutExercises, async () => {
    const workoutId = (await db.workouts.add({
      name: routine?.name ?? nameForNow(),
      startedAt: Date.now(),
      routineId: routine?.id,
    })) as number
    if (routine) {
      for (const [order, re] of routine.exercises.entries()) {
        await db.workoutExercises.add({
          workoutId,
          exerciseId: re.exerciseId,
          exerciseOrder: order,
          repMin: re.repMin,
          repMax: re.repMax,
          targetRpe: re.targetRpe,
          restSec: re.restSec,
        })
        await db.sets.bulkAdd(
          Array.from({ length: re.sets }, (_, i) => ({
            workoutId,
            exerciseId: re.exerciseId,
            exerciseOrder: order,
            setIndex: i,
            kind: 'normal' as const,
            done: false,
          })),
        )
      }
    }
    return workoutId
  })
}

function nameForNow() {
  const h = new Date().getHours()
  return h < 12 ? 'Entreno de mañana' : h < 20 ? 'Entreno de tarde' : 'Entreno de noche'
}

export async function addExercisesToWorkout(workoutId: number, exerciseIds: string[]) {
  const metas = await db.workoutExercises.where('workoutId').equals(workoutId).toArray()
  let order = metas.length ? Math.max(...metas.map((m) => m.exerciseOrder)) + 1 : 0
  for (const exerciseId of exerciseIds) {
    await db.workoutExercises.add({ workoutId, exerciseId, exerciseOrder: order, repMin: 8, repMax: 12, restSec: 120 })
    await db.sets.add({ workoutId, exerciseId, exerciseOrder: order, setIndex: 0, kind: 'normal', done: false })
    order++
  }
}

export async function finishWorkout(workoutId: number, sessionRpe?: number) {
  await db.transaction('rw', db.workouts, db.sets, async () => {
    // Las series no marcadas se descartan, como en Hevy.
    await db.sets.where('workoutId').equals(workoutId).filter((s) => !s.done).delete()
    await db.workouts.update(workoutId, { endedAt: Date.now(), sessionRpe })
  })
}

export async function deleteWorkout(workoutId: number) {
  await db.transaction('rw', db.workouts, db.sets, db.workoutExercises, async () => {
    await db.sets.where('workoutId').equals(workoutId).delete()
    await db.workoutExercises.where('workoutId').equals(workoutId).delete()
    await db.workouts.delete(workoutId)
  })
}

export async function exportAll() {
  return {
    app: 'forja',
    version: 1,
    exportedAt: new Date().toISOString(),
    exercises: await db.exercises.filter((e) => !!e.custom).toArray(),
    workouts: await db.workouts.toArray(),
    sets: await db.sets.toArray(),
    routines: await db.routines.toArray(),
    workoutExercises: await db.workoutExercises.toArray(),
  }
}

export async function importAll(data: Awaited<ReturnType<typeof exportAll>>) {
  if (data.app !== 'forja') throw new Error('El archivo no es una copia de Forja')
  await db.transaction('rw', [db.exercises, db.workouts, db.sets, db.routines, db.workoutExercises], async () => {
    await Promise.all([db.workouts.clear(), db.sets.clear(), db.routines.clear(), db.workoutExercises.clear()])
    await db.exercises.bulkPut(data.exercises)
    await db.workouts.bulkAdd(data.workouts)
    await db.sets.bulkAdd(data.sets)
    await db.routines.bulkAdd(data.routines)
    await db.workoutExercises.bulkAdd(data.workoutExercises)
  })
}
