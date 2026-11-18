import { Meter, MissionList } from '../components/game'
import { TopBar } from '../components/ui'
import { useGame } from '../hooks/useGame'
import { ATTR_STEP, EXP } from '../lib/game'

const fmtDate = (t: number) => new Date(t).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' })

/** Ficha de personaje: nivel, atributos, misiones, hitos y cómo se gana EXP. */
export default function Character() {
  const g = useGame()
  if (!g) return null
  const unlocked = g.feats.filter((f) => f.at)
  return (
    <div className="page">
      <TopBar title="Ficha de personaje" back="/" />

      <section className="char-card" aria-label="Nivel">
        <div className="char-top">
          <span className="lv" style={{ fontSize: '3rem' }}><small>NV</small>{g.level}</span>
          <div className="grow">
            <div className="lab-label">Experiencia total · {g.exp} EXP</div>
            <Meter value={g.progress} label="Experiencia hacia el siguiente nivel" />
            <div className="char-exp">
              <span>{g.into} / {g.need}</span>
              <span>Faltan {g.need - g.into} para el NV {g.level + 1}</span>
            </div>
          </div>
        </div>
        <div className="char-exp" style={{ marginTop: 0 }}>
          <span>Racha: {g.streak.current} {g.streak.current === 1 ? 'semana' : 'semanas'} (mejor: {g.streak.best})</span>
          <span>Esta semana: {g.streak.thisWeek}/{EXP.weekMinSessions}</span>
        </div>
      </section>

      <section className="section" aria-label="Atributos">
        <div className="section-head">
          <h2 className="h2">Atributos</h2>
          <span className="tiny muted">+1 nivel por cada +{String(ATTR_STEP * 100).replace('.', ',')} % de e1RM</span>
        </div>
        <div className="char-card attrs">
          {g.attributes.map((a) => (
            <div key={a.id} className="attr">
              <span className="attr-name">{a.label}</span>
              <span className="lv"><small>NV</small>{a.level}</span>
              <Meter thin value={a.progress} label={`${a.label}: progreso hacia el nivel ${a.level + 1}`} />
              <span className="attr-value">
                {a.value}
                {a.basis?.length ? ` · ${a.basis.join(', ')}` : ''}
              </span>
            </div>
          ))}
        </div>
        <p className="tiny muted">
          La fuerza se mide frente a ti mismo: tu mejor 1RM estimado de las últimas 4 semanas comparado con tu primera sesión de cada ejercicio.
          Stamina sube con cada semana cumplida ({EXP.weekMinSessions} entrenos o más).
        </p>
      </section>

      <section className="section" aria-label="Misiones">
        <h2 className="h2">Misiones de la semana</h2>
        <div className="char-card"><MissionList missions={g.missions} /></div>
      </section>

      <section className="section" aria-label="Hitos">
        <div className="section-head">
          <h2 className="h2">Hitos</h2>
          <span className="small muted">{unlocked.length}/{g.feats.length}</span>
        </div>
        <div className="feats">
          {g.feats.map((f) => (
            <div key={f.id} className={`feat${f.at ? ' on' : ''}`}>
              <b>{f.title}</b>
              <span>{f.desc}</span>
              {f.at && <span>Conseguido el {fmtDate(f.at)} · +{EXP.feat} EXP</span>}
            </div>
          ))}
        </div>
      </section>

      <details className="section rules">
        <summary className="h2">Cómo se gana EXP</summary>
        <div className="list">
          {[
            ['Superar una serie de la vez anterior', `+${EXP.set} (máx. ${EXP.setCap} por sesión)`],
            ['Superar un ejercicio entero', `+${EXP.exercise}`],
            [`Sesión completa (${EXP.sessionMinSets}+ series)`, `+${EXP.session}`],
            ['Nota para el entrenador', `+${EXP.note}`],
            [`Semana cumplida (${EXP.weekMinSessions}+ entrenos)`, `+${EXP.week}`],
            ['Misión de la semana', `+${EXP.mission}`],
            ['Hito', `+${EXP.feat}`],
          ].map(([k, v]) => (
            <div key={k} className="list-row">
              <span className="grow small">{k}</span>
              <span className="mission-exp">{v}</span>
            </div>
          ))}
        </div>
        <p className="tiny muted">
          Solo da EXP lo que hace progresar: superar a tu yo anterior y ser constante. Las series de relleno no suman y una semana
          fallida no rompe la racha si tienes comodín (uno cada 4 semanas).
        </p>
      </details>
    </div>
  )
}
