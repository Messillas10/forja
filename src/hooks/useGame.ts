import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../db'
import { computeGame, type GameInput, type GameState } from '../lib/game'

/** Lee todo lo que necesita la capa de juego. */
export async function loadGameInput(): Promise<GameInput> {
  const [workouts, sets, exList, metas, routines] = await Promise.all([
    db.workouts.toArray(),
    db.sets.toArray(),
    db.exercises.toArray(),
    db.workoutExercises.toArray(),
    db.routines.toArray(),
  ])
  return { workouts, sets, exercises: new Map(exList.map((e) => [e.id, e])), metas, routines }
}

/** Estado del personaje, recalculado en vivo cuando cambian los datos. */
export function useGame(): GameState | undefined {
  return useLiveQuery(async () => computeGame(await loadGameInput()))
}

// ───────── Aviso «+EXP» (uno a la vez; el último manda) ─────────

type Toast = { id: number; text: string }
let current: Toast | null = null
const listeners = new Set<(t: Toast | null) => void>()
let seq = 0

export function expToast(text: string) {
  current = { id: ++seq, text }
  listeners.forEach((l) => l(current))
  const id = current.id
  setTimeout(() => {
    if (current?.id === id) {
      current = null
      listeners.forEach((l) => l(null))
    }
  }, 1700)
}

export function useExpToast() {
  const [t, setT] = useState<Toast | null>(current)
  useEffect(() => {
    listeners.add(setT)
    return () => void listeners.delete(setT)
  }, [])
  return t
}
