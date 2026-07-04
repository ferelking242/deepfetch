import { NavLink } from 'react-router-dom'
import { Activity, Layers, Shield, Settings, Zap, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

const NAV = [
  { to: '/playground', icon: FlaskConical, label: 'Playground' },
  { to: '/jobs',       icon: Layers,       label: 'Jobs' },
  { to: '/sessions',   icon: Shield,       label: 'Sessions' },
  { to: '/health',     icon: Activity,     label: 'Health' },
  { to: '/settings',   icon: Settings,     label: 'Settings' },
]

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-52 flex-shrink-0 flex flex-col border-r border-sidebar-border bg-sidebar">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
            <Zap size={13} className="text-primary" />
          </div>
          <span className="text-sm font-semibold tracking-tight">deepfetch</span>
          <span className="ml-auto text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">v1</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50'
                )
              }
            >
              <Icon size={14} className="flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Status */}
        <div className="px-4 py-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
            <span className="text-xs text-muted-foreground">Server running</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
