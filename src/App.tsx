import { useEffect } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { RestBar } from './components/ui'
import { syncSeedExercises } from './db'
import ActiveWorkout from './pages/ActiveWorkout'
import { ExerciseDetail, ExerciseList } from './pages/Exercises'
import { HistoryList, WorkoutDetail } from './pages/History'
import Home from './pages/Home'
import Progress from './pages/Progress'
import RoutineEditor from './pages/RoutineEditor'
import Tools from './pages/Tools'

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)

const TABS = [
  { to: '/', label: 'Entrenar', d: 'M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11' },
  { to: '/historial', label: 'Historial', d: 'M12 8v4l3 2M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5' },
  { to: '/ejercicios', label: 'Ejercicios', d: 'M4 6h16M4 12h16M4 18h10' },
  { to: '/progreso', label: 'Progreso', d: 'M3 20h18M6 16l4-5 4 3 5-7' },
  { to: '/herramientas', label: 'Herram.', d: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.8-.6-.6-2.8z' },
]

function TabBar() {
  const { pathname } = useLocation()
  if (pathname === '/entreno') return null
  return (
    <div className="tabbar">
      <nav>
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'}>
            {icon(t.d)}
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  useEffect(() => {
    syncSeedExercises()
    navigator.storage?.persist?.() // pide al navegador que no borre los datos
  }, [])
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/entreno" element={<ActiveWorkout />} />
        <Route path="/rutinas/:id" element={<RoutineEditor />} />
        <Route path="/historial" element={<HistoryList />} />
        <Route path="/historial/:id" element={<WorkoutDetail />} />
        <Route path="/ejercicios" element={<ExerciseList />} />
        <Route path="/ejercicios/:id" element={<ExerciseDetail />} />
        <Route path="/progreso" element={<Progress />} />
        <Route path="/herramientas" element={<Tools />} />
      </Routes>
      <TabBar />
      <RestBar />
    </HashRouter>
  )
}
