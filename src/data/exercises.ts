import type { Equipment, Exercise, Muscle } from '../types'

export const MUSCLE_LABEL: Record<Muscle, string> = {
  pecho: 'Pecho',
  dorsales: 'Dorsales',
  espalda_media: 'Espalda media',
  trapecio: 'Trapecio',
  lumbares: 'Lumbares',
  hombro_anterior: 'Hombro anterior',
  hombro_lateral: 'Hombro lateral',
  hombro_posterior: 'Hombro posterior',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  antebrazo: 'Antebrazo',
  cuadriceps: 'Cuádriceps',
  isquios: 'Isquiotibiales',
  gluteos: 'Glúteos',
  aductores: 'Aductores',
  gemelos: 'Gemelos',
  abdominales: 'Abdominales',
  oblicuos: 'Oblicuos',
}

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barra: 'Barra',
  mancuerna: 'Mancuerna',
  maquina: 'Máquina',
  polea: 'Polea',
  peso_corporal: 'Peso corporal',
  kettlebell: 'Kettlebell',
  barra_z: 'Barra Z',
  banda: 'Banda',
  smith: 'Smith',
}

type Def = [id: string, name: string, primary: Muscle, secondary: Muscle[], equipment: Equipment, extra?: Partial<Exercise>]

const W = { type: 'weight_reps' } as const
const L = { type: 'weight_reps', lowerBody: true } as const
const BW = { type: 'bodyweight_reps' } as const
const WBW = { type: 'weighted_bodyweight' } as const
const T = { type: 'duration' } as const

const DEFS: Def[] = [
  // Pecho
  ['press-banca', 'Press de banca', 'pecho', ['triceps', 'hombro_anterior'], 'barra', W],
  ['press-banca-inclinado', 'Press inclinado con barra', 'pecho', ['hombro_anterior', 'triceps'], 'barra', W],
  ['press-banca-declinado', 'Press declinado con barra', 'pecho', ['triceps'], 'barra', W],
  ['press-mancuernas', 'Press con mancuernas', 'pecho', ['triceps', 'hombro_anterior'], 'mancuerna', W],
  ['press-inclinado-mancuernas', 'Press inclinado con mancuernas', 'pecho', ['hombro_anterior', 'triceps'], 'mancuerna', W],
  ['aperturas-mancuernas', 'Aperturas con mancuernas', 'pecho', ['hombro_anterior'], 'mancuerna', W],
  ['cruce-poleas', 'Cruce de poleas', 'pecho', ['hombro_anterior'], 'polea', W],
  ['pec-deck', 'Contractor de pecho (pec deck)', 'pecho', [], 'maquina', W],
  ['press-pecho-maquina', 'Press de pecho en máquina', 'pecho', ['triceps'], 'maquina', W],
  ['press-banca-smith', 'Press de banca en Smith', 'pecho', ['triceps', 'hombro_anterior'], 'smith', W],
  ['fondos-pecho', 'Fondos en paralelas', 'pecho', ['triceps', 'hombro_anterior'], 'peso_corporal', WBW],
  ['flexiones', 'Flexiones', 'pecho', ['triceps', 'hombro_anterior'], 'peso_corporal', BW],

  // Espalda
  ['dominadas', 'Dominadas', 'dorsales', ['biceps', 'espalda_media'], 'peso_corporal', WBW],
  ['dominadas-supinas', 'Dominadas supinas', 'dorsales', ['biceps'], 'peso_corporal', WBW],
  ['jalon-pecho', 'Jalón al pecho', 'dorsales', ['biceps', 'espalda_media'], 'polea', W],
  ['jalon-agarre-estrecho', 'Jalón agarre estrecho', 'dorsales', ['biceps'], 'polea', W],
  ['remo-barra', 'Remo con barra', 'espalda_media', ['dorsales', 'biceps', 'lumbares'], 'barra', W],
  ['remo-pendlay', 'Remo Pendlay', 'espalda_media', ['dorsales', 'lumbares'], 'barra', W],
  ['remo-mancuerna', 'Remo con mancuerna', 'dorsales', ['espalda_media', 'biceps'], 'mancuerna', W],
  ['remo-polea-baja', 'Remo en polea baja', 'espalda_media', ['dorsales', 'biceps'], 'polea', W],
  ['remo-maquina', 'Remo en máquina', 'espalda_media', ['dorsales', 'biceps'], 'maquina', W],
  ['remo-t', 'Remo en T', 'espalda_media', ['dorsales', 'lumbares'], 'barra', W],
  ['pullover-polea', 'Pullover en polea', 'dorsales', [], 'polea', W],
  ['encogimientos-barra', 'Encogimientos con barra', 'trapecio', [], 'barra', W],
  ['encogimientos-mancuernas', 'Encogimientos con mancuernas', 'trapecio', [], 'mancuerna', W],
  ['hiperextensiones', 'Hiperextensiones', 'lumbares', ['gluteos', 'isquios'], 'peso_corporal', WBW],

  // Hombro
  ['press-militar', 'Press militar', 'hombro_anterior', ['triceps', 'hombro_lateral'], 'barra', W],
  ['press-hombro-mancuernas', 'Press de hombro con mancuernas', 'hombro_anterior', ['triceps', 'hombro_lateral'], 'mancuerna', W],
  ['press-hombro-maquina', 'Press de hombro en máquina', 'hombro_anterior', ['triceps'], 'maquina', W],
  ['elevaciones-laterales', 'Elevaciones laterales', 'hombro_lateral', [], 'mancuerna', W],
  ['elevaciones-laterales-polea', 'Elevaciones laterales en polea', 'hombro_lateral', [], 'polea', W],
  ['elevaciones-laterales-maquina', 'Elevaciones laterales en máquina', 'hombro_lateral', [], 'maquina', W],
  ['elevaciones-frontales', 'Elevaciones frontales', 'hombro_anterior', [], 'mancuerna', W],
  ['pajaros', 'Pájaros (vuelos posteriores)', 'hombro_posterior', ['espalda_media'], 'mancuerna', W],
  ['face-pull', 'Face pull', 'hombro_posterior', ['espalda_media', 'trapecio'], 'polea', W],
  ['reverse-pec-deck', 'Contractor inverso', 'hombro_posterior', ['espalda_media'], 'maquina', W],
  ['remo-al-menton', 'Remo al mentón', 'hombro_lateral', ['trapecio'], 'barra', W],

  // Bíceps
  ['curl-barra', 'Curl con barra', 'biceps', ['antebrazo'], 'barra', W],
  ['curl-barra-z', 'Curl con barra Z', 'biceps', ['antebrazo'], 'barra_z', W],
  ['curl-mancuernas', 'Curl con mancuernas', 'biceps', ['antebrazo'], 'mancuerna', W],
  ['curl-martillo', 'Curl martillo', 'biceps', ['antebrazo'], 'mancuerna', W],
  ['curl-inclinado', 'Curl inclinado', 'biceps', [], 'mancuerna', W],
  ['curl-predicador', 'Curl en banco Scott', 'biceps', [], 'barra_z', W],
  ['curl-polea', 'Curl en polea', 'biceps', [], 'polea', W],
  ['curl-concentrado', 'Curl concentrado', 'biceps', [], 'mancuerna', W],

  // Tríceps
  ['press-frances', 'Press francés', 'triceps', [], 'barra_z', W],
  ['extension-triceps-polea', 'Extensión de tríceps en polea', 'triceps', [], 'polea', W],
  ['extension-triceps-cuerda', 'Extensión de tríceps con cuerda', 'triceps', [], 'polea', W],
  ['extension-triceps-overhead', 'Extensión de tríceps sobre la cabeza', 'triceps', [], 'polea', W],
  ['press-cerrado', 'Press de banca agarre cerrado', 'triceps', ['pecho', 'hombro_anterior'], 'barra', W],
  ['fondos-banco', 'Fondos en banco', 'triceps', ['hombro_anterior'], 'peso_corporal', BW],
  ['patada-triceps', 'Patada de tríceps', 'triceps', [], 'mancuerna', W],

  // Antebrazo
  ['curl-muneca', 'Curl de muñeca', 'antebrazo', [], 'barra', W],
  ['paseo-granjero', 'Paseo del granjero', 'antebrazo', ['trapecio', 'abdominales'], 'mancuerna', W],

  // Pierna
  ['sentadilla', 'Sentadilla trasera', 'cuadriceps', ['gluteos', 'aductores', 'lumbares'], 'barra', L],
  ['sentadilla-frontal', 'Sentadilla frontal', 'cuadriceps', ['gluteos', 'abdominales'], 'barra', L],
  ['sentadilla-goblet', 'Sentadilla goblet', 'cuadriceps', ['gluteos'], 'kettlebell', W],
  ['sentadilla-hack', 'Sentadilla hack', 'cuadriceps', ['gluteos'], 'maquina', L],
  ['sentadilla-smith', 'Sentadilla en Smith', 'cuadriceps', ['gluteos'], 'smith', L],
  ['sentadilla-bulgara', 'Sentadilla búlgara', 'cuadriceps', ['gluteos', 'aductores'], 'mancuerna', W],
  ['prensa', 'Prensa de piernas', 'cuadriceps', ['gluteos', 'aductores'], 'maquina', L],
  ['zancadas', 'Zancadas', 'cuadriceps', ['gluteos', 'aductores'], 'mancuerna', W],
  ['extension-cuadriceps', 'Extensión de cuádriceps', 'cuadriceps', [], 'maquina', W],
  ['peso-muerto', 'Peso muerto', 'gluteos', ['isquios', 'lumbares', 'trapecio', 'cuadriceps'], 'barra', L],
  ['peso-muerto-sumo', 'Peso muerto sumo', 'gluteos', ['aductores', 'cuadriceps', 'lumbares'], 'barra', L],
  ['peso-muerto-rumano', 'Peso muerto rumano', 'isquios', ['gluteos', 'lumbares'], 'barra', L],
  ['peso-muerto-rumano-mancuernas', 'Peso muerto rumano con mancuernas', 'isquios', ['gluteos'], 'mancuerna', W],
  ['buenos-dias', 'Buenos días', 'isquios', ['lumbares', 'gluteos'], 'barra', L],
  ['curl-femoral-tumbado', 'Curl femoral tumbado', 'isquios', ['gemelos'], 'maquina', W],
  ['curl-femoral-sentado', 'Curl femoral sentado', 'isquios', [], 'maquina', W],
  ['curl-nordico', 'Curl nórdico', 'isquios', [], 'peso_corporal', BW],
  ['hip-thrust', 'Hip thrust', 'gluteos', ['isquios'], 'barra', L],
  ['puente-gluteo', 'Puente de glúteo', 'gluteos', ['isquios'], 'peso_corporal', BW],
  ['patada-gluteo-polea', 'Patada de glúteo en polea', 'gluteos', [], 'polea', W],
  ['abductores-maquina', 'Abducción de cadera en máquina', 'gluteos', [], 'maquina', W],
  ['aductores-maquina', 'Aducción de cadera en máquina', 'aductores', [], 'maquina', W],
  ['gemelos-pie', 'Elevación de gemelos de pie', 'gemelos', [], 'maquina', W],
  ['gemelos-sentado', 'Elevación de gemelos sentado', 'gemelos', [], 'maquina', W],
  ['gemelos-prensa', 'Gemelos en prensa', 'gemelos', [], 'maquina', W],
  ['swing-kettlebell', 'Swing con kettlebell', 'gluteos', ['isquios', 'lumbares'], 'kettlebell', W],

  // Core
  ['plancha', 'Plancha', 'abdominales', ['oblicuos'], 'peso_corporal', T],
  ['plancha-lateral', 'Plancha lateral', 'oblicuos', ['abdominales'], 'peso_corporal', T],
  ['crunch', 'Crunch abdominal', 'abdominales', [], 'peso_corporal', BW],
  ['crunch-polea', 'Crunch en polea', 'abdominales', [], 'polea', W],
  ['elevacion-piernas-colgado', 'Elevación de piernas colgado', 'abdominales', ['oblicuos'], 'peso_corporal', BW],
  ['rueda-abdominal', 'Rueda abdominal', 'abdominales', [], 'peso_corporal', BW],
  ['pallof-press', 'Pallof press', 'oblicuos', ['abdominales'], 'polea', W],
  ['russian-twist', 'Giros rusos', 'oblicuos', ['abdominales'], 'peso_corporal', BW],
]

export const SEED_EXERCISES: Exercise[] = DEFS.map(([id, name, primary, secondary, equipment, extra]) => ({
  id,
  name,
  primary,
  secondary,
  equipment,
  type: 'weight_reps',
  ...extra,
}))
