import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.tsx'
import Jobs from './pages/Jobs.tsx'
import Sessions from './pages/Sessions.tsx'
import Health from './pages/Health.tsx'
import Settings from './pages/Settings.tsx'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/jobs" replace />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/health" element={<Health />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  )
}
