import { Link } from 'react-router-dom'
import { useExpToast } from '../hooks/useGame'
import type { GameState, Mission } from '../lib/game'
import { Icon } from './icons'

export function ExpToast() {
  const t = useExpToast()
  if (!t) return null
  return (
    <div key={t.id} className="exp-toast" role="status" aria-live="polite">
      {t.text}
    </div>
  )
}

export function Meter({ value, thin, label }: { value: number; thin?: boolean; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className={`meter${thin ? ' thin' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

export function MissionList({ missions }: { missions: Mission[] }) {
  return (
    <div className="missions">
      {missions.map((m) => (
        <div key={m.id} className={`mission${m.done ? ' done' : ''}`}>
          <span className="mission-box" aria-hidden="true">{m.done && <Icon name="check" />}</span>
          <div>
            <div className="mission-title">{m.title}{m.progress && !m.done ? ` · ${m.progress[0]}/${m.progress[1]}` : ''}</div>
            <div className="mission-detail">{m.detail}</div>
          </div>
          <span className="mission-exp">{m.exp ? `+${m.exp} EXP` : ''}</span>
          <span className="sr-only">{m.done ? 'Cumplida' : 'Pendiente'}</span>
        </div>
      ))}
    </div>
  )
}

/** Tarjeta compacta del inicio: nivel, EXP, racha y misiones. */
export function CharacterCard({ g }: { g: GameState }) {
  return (
    <section className="char-card" aria-label="Tu personaje">
      <Link to="/personaje" className="char-top" aria-label={`Nivel ${g.level}. Ver ficha de personaje`}>
        <span className="lv"><small>NV</small>{g.level}</span>
        <div className="grow">
          <div className="lab-label">Ficha · experiencia</div>
          <Meter value={g.progress} label="Experiencia hacia el siguiente nivel" />
          <div className="char-exp">
            <span>{g.into} / {g.need} EXP</span>
            <span>Racha {g.streak.current} {g.streak.current === 1 ? 'semana' : 'semanas'}</span>
          </div>
        </div>
        <Icon name="chev" className="chev" />
      </Link>
      <div className="lab-label">Misiones de la semana</div>
      <MissionList missions={g.missions} />
    </section>
  )
}
