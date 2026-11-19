/**
 * Pitido de fin de descanso con Web Audio (sin archivos de sonido).
 * Los tonos se programan por adelantado en el reloj del AudioContext: así suenan a su hora aunque
 * el navegador ralentice los temporizadores de JavaScript con la pantalla apagada o en segundo plano.
 * El contexto se crea/reanuda en un toque del usuario (al marcar la serie), que es lo que exigen los móviles.
 */
const KEY = 'forja.sonido'
let ctx: AudioContext | null = null
let scheduled: OscillatorNode[] = []

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* ignorar */
  }
  if (!on) cancelBeeps()
}

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(c: AudioContext, at: number, freq: number, dur: number, vol: number) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  // Envolvente corta para que no haga «clic»
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(vol, at + 0.01)
  gain.gain.setValueAtTime(vol, at + dur - 0.04)
  gain.gain.linearRampToValueAtTime(0, at + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(at)
  osc.stop(at + dur)
  osc.onended = () => {
    scheduled = scheduled.filter((o) => o !== osc)
  }
  scheduled.push(osc)
}

export function cancelBeeps() {
  for (const o of scheduled) {
    try {
      o.stop()
    } catch {
      /* ya parado */
    }
  }
  scheduled = []
}

/** Programa la cuenta atrás: pips a los 3, 2 y 1 segundos del final y un tono largo al terminar. */
export function scheduleRestEnd(endAt: number) {
  cancelBeeps()
  if (!soundOn()) return
  const c = audio()
  if (!c) return
  const inSec = (endAt - Date.now()) / 1000
  const base = c.currentTime
  for (const k of [3, 2, 1]) if (inSec - k > 0.05) tone(c, base + inSec - k, 880, 0.09, 0.25)
  if (inSec > 0) tone(c, base + inSec, 1320, 0.45, 0.35)
}

/** Pitido corto de prueba (al activar el sonido). */
export function testBeep() {
  const c = audio()
  if (c) tone(c, c.currentTime + 0.02, 1320, 0.15, 0.3)
}
