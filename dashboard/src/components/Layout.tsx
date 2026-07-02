import { NavLink } from 'react-router-dom'
import { Activity, Layers, Shield, Settings, Zap } from 'lucide-react'
import clsx from 'clsx'
import type { ReactNode } from 'react'

const NAV = [
  { to: '/jobs',     icon: Layers,   label: 'Jobs' },
  { to: '/sessions', icon: Shield,   label: 'Sessions' },
  { to: '/health',   icon: Activity, label: 'Health' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-gradient">deepfetch</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-gray-800 text-cyan-400'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-800">
          <p className="text-xs text-gray-600">DeepFetch v1.0.0</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-gray-950">
        {children}
      </main>
    </div>
  )
}
