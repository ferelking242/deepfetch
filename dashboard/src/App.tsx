import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import Layout from './components/Layout'
import Jobs from './pages/Jobs'
import Sessions from './pages/Sessions'
import Health from './pages/Health'
import Settings from './pages/Settings'
import Playground from './pages/Playground'

export default function App() {
  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/playground" replace />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/health" element={<Health />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
      <Toaster />
    </>
  )
}
