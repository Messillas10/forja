import { useEffect } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Icon, type IconName } from './components/icons'
import { ExpToast } from './components/game'
import { RestBar } from './components/ui'
import { syncSeedExercises } from './db'
import ActiveWorkout from './pages/ActiveWorkout'
import Character from './pages/Character'
import Coach, { ImportRoutines } from './pages/Coach'
import { ExerciseDetail, ExerciseList } from './pages/Exercises'
import { HistoryList, WorkoutDetail } from './pages/History'
import Home from './pages/Home'
import Progress from './pages/Progress'
import RoutineEditor from './pages/RoutineEditor'
import Tools from './pages/Tools'

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Entrenar', icon: 'train' },
  { to: '/historial', label: 'Historial', icon: 'history' },
  { to: '/ejercicios', label: 'Ejercicios', icon: 'exercises' },
  { to: '/progreso', label: 'Progreso', icon: 'progress' },
  { to: '/herramientas', label: 'Herramientas', icon: 'tools' },
]

const NO_TABS = ['/entreno', '/importar']

function Shell() {
  const { pathname } = useLocation()
  const tabs = !NO_TABS.some((p) => pathname.startsWith(p))
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return (
    <div className={tabs ? 'with-tabs' : undefined}>
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
        <Route path="/entrenador" element={<Coach />} />
        <Route path="/personaje" element={<Character />} />
        <Route path="/importar/:code" element={<ImportRoutines />} />
      </Routes>
      {tabs && (
        <div className="tabbar">
          <nav aria-label="Secciones">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.to === '/'}>
                <Icon name={t.icon} />
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
      <RestBar />
      <ExpToast />
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
      <Shell />
    </HashRouter>
  )
}
