import { useRef, useState } from 'react'
import { fmtKg } from '../components/ui'
import { exportAll, importAll } from '../db'
import { inol, ONE_RM_FORMULAS, oneRm, oneRmConsensus, platesPerSide, rpePercent, RPE_VALUES, type OneRmFormula } from '../lib/formulas'

export default function Tools() {
  return (
    <div className="page">
      <h1>Herramientas</h1>
      <OneRmCalc />
      <PlateCalc />
      <RpeTable />
      <Backup />
    </div>
  )
}

function OneRmCalc() {
  const [w, setW] = useState(100)
  const [r, setR] = useState(5)
  const consensus = oneRmConsensus(w, r)
  return (
    <div className="card">
      <h3>Calculadora de 1RM</h3>
      <div className="row">
        <label className="row grow">Peso <input className="cell" style={{ maxWidth: 90 }} inputMode="decimal" value={w || ''} onChange={(e) => setW(+e.target.value.replace(',', '.') || 0)} /> kg</label>
        <label className="row">Reps <input className="cell" inputMode="numeric" value={r || ''} onChange={(e) => setR(+e.target.value || 0)} /></label>
      </div>
      <div className="stat"><b>{fmtKg(consensus)} kg</b><small>Media de 7 fórmulas</small></div>
      {r > 10 && <small style={{ color: 'var(--warn)' }}>Con más de 10 reps la estimación pierde precisión (LeSuer et al., 1997).</small>}
      <table className="plain">
        <thead><tr><th>Fórmula</th><th>1RM</th></tr></thead>
        <tbody>
          {(Object.keys(ONE_RM_FORMULAS) as OneRmFormula[]).map((k) => (
            <tr key={k}><td>{ONE_RM_FORMULAS[k].label} <span className="ref">({ONE_RM_FORMULAS[k].ref})</span></td><td>{fmtKg(oneRm(w, r, k))}</td></tr>
          ))}
        </tbody>
      </table>
      <h3 style={{ marginTop: 8 }}>Porcentajes</h3>
      <table className="plain">
        <thead><tr><th>%1RM</th><th>kg</th><th>INOL 1 serie de 5</th></tr></thead>
        <tbody>
          {[95, 90, 85, 80, 75, 70, 65, 60].map((p) => (
            <tr key={p}><td>{p} %</td><td>{fmtKg(consensus * p / 100)}</td><td>{inol(5, p / 100).toFixed(2)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="ref">INOL (Hristov, 2005): reps / (100 − %1RM). Por ejercicio y sesión, 0,4–1 se considera productivo. Heurística práctica, no validada experimentalmente.</p>
    </div>
  )
}

function PlateCalc() {
  const [total, setTotal] = useState(100)
  const [bar, setBar] = useState(20)
  const { plates, remainder } = platesPerSide(total, bar)
  const colors: Record<number, string> = { 25: '#dc2626', 20: '#2563eb', 15: '#eab308', 10: '#16a34a', 5: '#e5e7eb', 2.5: '#111827', 1.25: '#9ca3af' }
  return (
    <div className="card">
      <h3>Calculadora de discos</h3>
      <div className="row">
        <label className="row grow">Total <input className="cell" style={{ maxWidth: 90 }} inputMode="decimal" value={total || ''} onChange={(e) => setTotal(+e.target.value.replace(',', '.') || 0)} /> kg</label>
        <label className="row">Barra <select className="cell" value={bar} onChange={(e) => setBar(+e.target.value)}>{[20, 15, 10].map((b) => <option key={b}>{b}</option>)}</select></label>
      </div>
      <div className="row" style={{ minHeight: 70, gap: 3 }}>
        <div style={{ width: 30, height: 10, background: '#6b7280', borderRadius: 2 }} />
        {plates.map((p, i) => (
          <div key={i} title={`${p} kg`} style={{ width: 14, height: 20 + p * 2, background: colors[p], border: '1px solid #000', borderRadius: 3 }} />
        ))}
      </div>
      <div>Por lado: <b>{plates.length ? plates.map(fmtKg).join(' + ') : 'solo barra'}</b></div>
      {remainder > 0 && <small style={{ color: 'var(--warn)' }}>No exacto: faltan {fmtKg(remainder)} kg.</small>}
      {remainder < 0 && <small style={{ color: 'var(--warn)' }}>El total es menor que la barra.</small>}
    </div>
  )
}

function RpeTable() {
  return (
    <div className="card">
      <h3>Tabla RPE → %1RM</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="plain">
          <thead><tr><th>RPE</th>{Array.from({ length: 10 }, (_, i) => <th key={i}>{i + 1}</th>)}</tr></thead>
          <tbody>
            {[...RPE_VALUES].reverse().map((rpe) => (
              <tr key={rpe}><td>{rpe}</td>{Array.from({ length: 10 }, (_, i) => <td key={i}>{Math.round((rpePercent(i + 1, rpe) ?? 0) * 1000) / 10}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ref">Columnas = repeticiones. RPE basado en repeticiones en reserva: RPE 8 = te quedaban 2 reps (Zourdos et al., 2016; Helms et al., 2016).</p>
    </div>
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
    a.download = `forja-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  async function doImport(f: File) {
    if (!confirm('Importar reemplazará tu historial actual. ¿Continuar?')) return
    try {
      await importAll(JSON.parse(await f.text()))
      setMsg('Copia restaurada.')
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`)
    }
  }
  return (
    <div className="card">
      <h3>Copia de seguridad</h3>
      <small>Tus datos viven solo en este dispositivo. Exporta una copia de vez en cuando.</small>
      <div className="row">
        <button className="btn grow" onClick={doExport}>Exportar JSON</button>
        <button className="btn grow" onClick={() => fileRef.current?.click()}>Importar</button>
      </div>
      <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
      {msg && <small>{msg}</small>}
    </div>
  )
}
