import { useEffect, useState, useSyncExternalStore } from 'react'

/**
 * Temporizador de descanso global. Guarda la hora de fin (no un contador), así sigue siendo
 * correcto aunque el móvil bloquee la pantalla o se recargue la página.
 */
interface State {
  endAt: number | null
  total: number
}

const KEY = 'forja.rest'
let state: State = load()
const listeners = new Set<() => void>()

function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (s && s.endAt > Date.now()) return s
  } catch {
    /* sin almacenamiento */
  }
  return { endAt: null, total: 0 }
}

function set(next: State) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignorar */
  }
  listeners.forEach((l) => l())
}

export const restTimer = {
  start(seconds: number) {
    if (seconds <= 0) return
    set({ endAt: Date.now() + seconds * 1000, total: seconds })
  },
  add(seconds: number) {
    if (!state.endAt) return
    const endAt = Math.max(Date.now(), state.endAt + seconds * 1000)
    set({ endAt, total: Math.max(1, state.total + seconds) })
  },
  stop() {
    set({ endAt: null, total: 0 })
  },
}

export function useRestTimer() {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!s.endAt) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (s.endAt && t >= s.endAt) {
        try {
          navigator.vibrate?.([200, 100, 200])
        } catch {
          /* sin vibración */
        }
        restTimer.stop()
      }
    }, 250)
    return () => clearInterval(id)
  }, [s.endAt])
  const remaining = s.endAt ? Math.max(0, Math.ceil((s.endAt - now) / 1000)) : 0
  return { active: !!s.endAt, remaining, total: s.total }
}

export const fmtClock = (sec: number) => {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
