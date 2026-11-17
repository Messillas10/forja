import type { Routine, RoutineExercise } from '../types'

/**
 * Formato compacto para pasar rutinas por enlace (p. ej. desde el entrenador de Claude):
 *   { v: 1, r: [{ n: nombre, e: [[exerciseId, series, repMin, repMax, rpe|null, descansoSeg], ...] }] }
 * JSON → deflate-raw → base64url. Va en el fragmento (#) de la URL, así que nunca llega a ningún servidor.
 */
export interface SharedRoutines {
  v: 1
  r: { n: string; e: [string, number, number, number, number | null, number][] }[]
}

const b64url = {
  encode(bytes: Uint8Array) {
    let bin = ''
    bytes.forEach((b) => (bin += String.fromCharCode(b)))
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  decode(s: string) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  },
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export async function encodeRoutines(routines: Pick<Routine, 'name' | 'exercises'>[]): Promise<string> {
  const data: SharedRoutines = {
    v: 1,
    r: routines.map((r) => ({
      n: r.name,
      e: r.exercises.map((e) => [e.exerciseId, e.sets, e.repMin, e.repMax, e.targetRpe ?? null, e.restSec]),
    })),
  }
  const json = new TextEncoder().encode(JSON.stringify(data))
  return b64url.encode(await pipe(json, new CompressionStream('deflate-raw')))
}

export async function decodeRoutines(code: string): Promise<Pick<Routine, 'name' | 'exercises'>[]> {
  // Acepta el código suelto o el enlace completo.
  const clean = decodeURIComponent(code.trim().split('/importar/').pop()!.split(/[?\s]/)[0])
  const raw = await pipe(b64url.decode(clean), new DecompressionStream('deflate-raw'))
  const data = JSON.parse(new TextDecoder().decode(raw)) as SharedRoutines
  if (data.v !== 1 || !Array.isArray(data.r)) throw new Error('Formato de rutina no reconocido')
  return data.r.map((r) => ({
    name: String(r.n),
    exercises: r.e.map(
      ([exerciseId, sets, repMin, repMax, rpe, restSec]): RoutineExercise => ({
        exerciseId,
        sets: Number(sets),
        repMin: Number(repMin),
        repMax: Number(repMax),
        targetRpe: rpe ?? undefined,
        restSec: Number(restSec),
      }),
    ),
  }))
}
