import { useRef, useState } from 'react'
import { fmtKg } from '../components/ui'
import { exportAll, importAll } from '../db'
import { inol, ONE_RM_FORMULAS, oneRm, oneRmConsensus, platesPerSide, rpePercent, RPE_VALUES, type OneRmFormula } from '../lib/formulas'
import { getTheme, setTheme, type ThemePref } from '../lib/theme'

export default function Tools() {
  return (
    <div className="page">
      <h1 className="display title">Herramientas</h1>
      <PlateCalc />
      <OneRmCalc />
      <RpeTable />
      <Backup />
      <ThemeSwitch />
    </div>
  )
}

const num = (v: string) => Number(v.replace(',', '.')) || 0

/** Colores de disco de competición (IWF): aquí sí significan algo. */
const PLATE: Record<number, { fill: string; h: number; w: number }> = {
  25: { fill: '#d7322c', h: 92, w: 18 },
  20: { fill: '#2457c9', h: 92, w: 16 },
  15: { fill: '#e9b512', h: 80, w: 14 },
  10: { fill: '#2e8a4c', h: 68, w: 13 },
  5: { fill: '#f2f2ef', h: 52, w: 11 },
  2.5: { fill: '#2b2f33', h: 42, w: 9 },
  1.25: { fill: '#a7adb2', h: 34, w: 7 },
}

function PlateCalc() {
  const [total, setTotal] = useState('100')
  const [bar, setBar] = useState(20)
  const t = num(total)
  const { plates, remainder } = platesPerSide(t, bar)
  return (
    <section className="block">
      <h2 className="h2">Discos para la barra</h2>
      <div className="row" style={{ gap: 12 }}>
        <label className="stack tiny muted grow">Peso total, kg
          <input className="field num" style={{ fontSize: '1.5rem', color: 'var(--ink)' }} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} onFocus={(e) => e.target.select()} />
        </label>
        <div className="stack tiny muted">Barra
          <div className="segmented">
            {[20, 15, 10].map((b) => <button key={b} className={bar === b ? 'on' : undefined} onClick={() => setBar(b)} aria-pressed={bar === b} style={{ minWidth: 44 }}>{b}</button>)}
          </div>
        </div>
      </div>
      <svg viewBox="0 0 320 104" width="100%" role="img" aria-label={`Por lado: ${plates.map(fmtKg).join(', ') || 'solo barra'}`}>
        <rect x="0" y="47" width="320" height="10" rx="3" fill="var(--steel)" opacity="0.5" />
        <rect x="40" y="38" width="10" height="28" rx="2" fill="var(--steel)" />
        {(() => {
          let x = 52
          return plates.map((p, i) => {
            const s = PLATE[p]
            const el = <rect key={i} x={x} y={52 - s.h / 2} width={s.w} height={s.h} rx="3" fill={s.fill} stroke="rgba(0,0,0,.35)" strokeWidth="1" />
            x += s.w + 2
            return el
          })
        })()}
      </svg>
      <div className="row between">
        <span className="small muted">En cada lado</span>
        <span className="num" style={{ fontSize: '1.5rem' }}>{plates.length ? plates.map(fmtKg).join(' + ') : 'Solo la barra'}</span>
      </div>
      {remainder > 0 && <p className="small" style={{ color: 'var(--warn)' }}>No sale exacto con discos estándar: faltan {fmtKg(remainder)} kg.</p>}
      {t > 0 && remainder < 0 && <p className="small" style={{ color: 'var(--warn)' }}>Es menos de lo que pesa la barra.</p>}
    </section>
  )
}

function OneRmCalc() {
  const [w, setW] = useState('80')
  const [r, setR] = useState('8')
  const weight = num(w)
  const reps = Math.round(num(r))
  const consensus = oneRmConsensus(weight, reps)
  return (
    <section className="block">
      <h2 className="h2">Tu máximo a una repetición</h2>
      <p className="small muted">Escribe una serie que hayas hecho y calcula cuánto levantarías una sola vez, sin tener que probarlo.</p>
      <div className="row" style={{ gap: 12 }}>
        <label className="stack tiny muted grow">Peso, kg<input className="field num" style={{ fontSize: '1.25rem', color: 'var(--ink)' }} inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} onFocus={(e) => e.target.select()} /></label>
        <label className="stack tiny muted grow">Repeticiones<input className="field num" style={{ fontSize: '1.25rem', color: 'var(--ink)' }} inputMode="numeric" value={r} onChange={(e) => setR(e.target.value)} onFocus={(e) => e.target.select()} /></label>
      </div>
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <span className="small muted">Máximo estimado</span>
        <span className="target-figure" style={{ fontSize: '2.5rem' }}>{fmtKg(consensus)}<small>kg</small></span>
      </div>
      {reps > 10 && <p className="small" style={{ color: 'var(--warn)' }}>Con más de 10 repeticiones la estimación pierde precisión.</p>}
      <details>
        <summary>Porcentajes del máximo</summary>
        <table className="data">
          <thead><tr><th>% del máximo</th><th>kg</th><th>INOL, 5 reps</th></tr></thead>
          <tbody>
            {[95, 90, 85, 80, 75, 70, 65, 60].map((p) => (
              <tr key={p}><td>{p} %</td><td className="strong">{fmtKg((consensus * p) / 100)}</td><td>{inol(5, p / 100).toFixed(2).replace('.', ',')}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="ref" style={{ marginTop: 8 }}>INOL (Hristov, 2005) mide la dureza de una serie. Es una regla práctica de entrenadores, sin validación científica. Útil en programas de fuerza; en tu plan puedes ignorarlo.</p>
      </details>
      <details>
        <summary>Cada fórmula</summary>
        <table className="data">
          <tbody>
            {(Object.keys(ONE_RM_FORMULAS) as OneRmFormula[]).map((k) => (
              <tr key={k}><td>{ONE_RM_FORMULAS[k].label} <span className="tiny muted">({ONE_RM_FORMULAS[k].ref})</span></td><td className="strong">{fmtKg(oneRm(weight, reps, k))}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="ref" style={{ marginTop: 8 }}>El resultado de arriba es la media de las 7. Son fiables hasta unas 10 repeticiones (LeSuer et al., 1997).</p>
      </details>
    </section>
  )
}

function RpeTable() {
  return (
    <section className="block">
      <h2 className="h2">Qué significa el RPE</h2>
      <p className="small">Lo duro que fue una serie: <b>10</b>, no podías hacer ni una más; <b>9</b>, te quedaba una; <b>8</b>, te quedaban dos. Tu plan pide entre 8 y 9.</p>
      <details>
        <summary>Tabla de % del máximo</summary>
        <div style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead><tr><th>RPE</th>{Array.from({ length: 10 }, (_, i) => <th key={i}>{i + 1}</th>)}</tr></thead>
            <tbody>
              {[...RPE_VALUES].reverse().map((rpe) => (
                <tr key={rpe}><td className="strong">{String(rpe).replace('.', ',')}</td>{Array.from({ length: 10 }, (_, i) => <td key={i}>{Math.round((rpePercent(i + 1, rpe) ?? 0) * 100)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ref" style={{ marginTop: 8 }}>Columnas: repeticiones hechas. Valores: % del máximo. La app la usa para calcular tu máximo estimado (Zourdos et al., 2016; Helms et al., 2016).</p>
      </details>
    </section>
  )
}

function Backup() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  async function doExport() {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `forja-copia-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setMsg('Copia descargada. Guárdala en Drive o envíatela.')
  }
  async function doImport(f: File) {
    if (!confirm('Restaurar una copia reemplaza todo tu historial actual. ¿Continuar?')) return
    try {
      await importAll(JSON.parse(await f.text()))
      setMsg('Copia restaurada.')
    } catch (e) {
      setMsg(`No se pudo restaurar: ${(e as Error).message}.`)
    }
  }
  return (
    <section className="block">
      <h2 className="h2">Copia de seguridad</h2>
      <p className="small muted">Tus entrenos solo están en este móvil. Si borras los datos del navegador o cambias de móvil, se pierden. Descarga una copia cada semana.</p>
      <div className="row">
        <button className="btn ink grow" onClick={doExport}>Descargar copia</button>
        <button className="btn outline grow" onClick={() => fileRef.current?.click()}>Restaurar</button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
      {msg && <p className="small" role="status">{msg}</p>}
    </section>
  )
}

function ThemeSwitch() {
  const [pref, setPref] = useState<ThemePref>(getTheme)
  const opts: [ThemePref, string][] = [['system', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']]
  return (
    <section className="section">
      <h2 className="h2">Apariencia</h2>
      <div className="segmented">
        {opts.map(([v, l]) => (
          <button key={v} className={pref === v ? 'on' : undefined} aria-pressed={pref === v} onClick={() => { setPref(v); setTheme(v) }}>{l}</button>
        ))}
      </div>
    </section>
  )
}
