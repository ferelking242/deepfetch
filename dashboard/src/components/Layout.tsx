import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Activity, Layers, Shield, Settings, Zap,
  FlaskConical, Sun, Moon, Monitor, Languages,
  ChevronLeft, ChevronRight, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/theme'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import type { ReactNode } from 'react'

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
]

function useNav() {
  const { t } = useTranslation()
  return [
    { to: '/playground', icon: FlaskConical, label: t('nav.playground') },
    { to: '/jobs',       icon: Layers,       label: t('nav.jobs') },
    { to: '/sessions',   icon: Shield,       label: t('nav.sessions') },
    { to: '/health',     icon: Activity,     label: t('nav.health') },
    { to: '/settings',   icon: Settings,     label: t('nav.settings') },
  ]
}

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme()
  const { t } = useTranslation()
  const Icon = { dark: Moon, light: Sun, system: Monitor }[theme]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-accent',
            compact ? 'h-8 w-8 justify-center' : 'h-8 px-2.5 text-xs font-medium'
          )}
          title={t('common.theme')}
        >
          <Icon size={14} />
          {!compact && <span>{t(`common.${theme}`)}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuLabel className="text-xs">{t('common.theme')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={theme} onValueChange={v => setTheme(v as typeof theme)}>
          <DropdownMenuRadioItem value="light" className="gap-2 text-xs cursor-pointer">
            <Sun size={12} /> {t('common.light')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="gap-2 text-xs cursor-pointer">
            <Moon size={12} /> {t('common.dark')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="gap-2 text-xs cursor-pointer">
            <Monitor size={12} /> {t('common.system')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LangToggle({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation()
  const current = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0]

  const changeLang = (code: string) => {
    void i18n.changeLanguage(code)
    localStorage.setItem('df-lang', code)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-accent',
            compact ? 'h-8 w-8 justify-center' : 'h-8 px-2.5 text-xs font-medium'
          )}
          title={t('common.language')}
        >
          {compact ? <Languages size={14} /> : <span>{current.flag} {current.label}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs">{t('common.language')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={i18n.language} onValueChange={changeLang}>
          {LANGUAGES.map(l => (
            <DropdownMenuRadioItem key={l.code} value={l.code} className="gap-2 text-xs cursor-pointer">
              <span>{l.flag}</span> {l.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const nav = useNav()
  const { t } = useTranslation()

  return (
    <aside className={cn(
      'hidden lg:flex flex-col border-r border-sidebar-border bg-sidebar flex-shrink-0 transition-all duration-200 ease-in-out',
      collapsed ? 'w-[60px]' : 'w-[220px]'
    )}>
      <div className={cn(
        'flex items-center border-b border-sidebar-border h-14 flex-shrink-0',
        collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'
      )}>
        <div className="h-7 w-7 flex items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20 flex-shrink-0">
          <Zap size={13} className="text-primary" />
        </div>
        {!collapsed && (
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-sm font-semibold tracking-tight truncate">deepfetch</span>
            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">v1</span>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) => cn(
              'flex items-center rounded-md text-sm transition-colors',
              collapsed ? 'h-9 justify-center' : 'gap-2.5 px-2.5 py-2',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50'
            )}
          >
            <Icon size={15} className="flex-shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="px-2 py-3 border-t border-sidebar-border space-y-1">
        {!collapsed && (
          <div className="flex items-center gap-1 px-1 pb-1">
            <ThemeToggle compact />
            <LangToggle compact />
          </div>
        )}
        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'px-1 gap-2')}>
          {!collapsed && (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot flex-shrink-0" />
              <span className="text-xs text-muted-foreground truncate">{t('common.serverRunning')}</span>
            </div>
          )}
          <button
            onClick={onToggle}
            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
        </div>
      </div>
    </aside>
  )
}

function MobileHeader() {
  const location = useLocation()
  const nav = useNav()
  const current = nav.find(n => location.pathname.startsWith(n.to))

  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center gap-3 px-4 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="h-7 w-7 flex items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20 flex-shrink-0">
        <Zap size={13} className="text-primary" />
      </div>
      <span className="text-sm font-semibold flex-1 truncate">{current?.label ?? 'deepfetch'}</span>
      <ThemeToggle compact />
      <LangToggle compact />
    </header>
  )
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNav()
  const { t } = useTranslation()

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border flex flex-col animate-slide-in lg:hidden">
        <div className="flex items-center justify-between h-14 px-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 flex items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
              <Zap size={13} className="text-primary" />
            </div>
            <span className="text-sm font-semibold">deepfetch</span>
            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">v1</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <X size={16} />
          </button>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} onClick={onClose}
              className={({ isActive }) => cn(
                'flex items-center gap-2.5 px-2.5 py-2.5 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-sidebar-border space-y-3">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
            <span className="text-xs text-muted-foreground">{t('common.serverRunning')}</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LangToggle />
          </div>
        </div>
      </div>
    </>
  )
}

function BottomNav() {
  const nav = useNav()
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-[60px] flex items-stretch border-t border-border bg-background/90 backdrop-blur-md">
      {nav.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to}
          className={({ isActive }) => cn(
            'flex-1 flex flex-col items-center justify-center gap-1 transition-colors',
            isActive ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          {({ isActive }) => (
            <>
              <div className={cn(
                'h-7 w-12 flex items-center justify-center rounded-full transition-all',
                isActive ? 'bg-primary/15' : ''
              )}>
                <Icon size={17} />
              </div>
              <span className="text-[9px] font-medium leading-none">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function DesktopHeader() {
  const location = useLocation()
  const nav = useNav()
  const current = nav.find(n => location.pathname.startsWith(n.to))

  return (
    <header className="hidden lg:flex h-14 items-center px-6 border-b border-border bg-background/90 backdrop-blur-md flex-shrink-0">
      <span className="text-sm font-semibold flex-1">{current?.label}</span>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <LangToggle />
      </div>
    </header>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('df-sidebar-collapsed') === 'true')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const toggleCollapsed = () => setCollapsed(c => {
    const next = !c
    localStorage.setItem('df-sidebar-collapsed', String(next))
    return next
  })

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <MobileHeader />
        <DesktopHeader />
        <main className="flex-1 overflow-y-auto overscroll-contain pt-14 pb-[60px] lg:pt-0 lg:pb-0">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  )
}
