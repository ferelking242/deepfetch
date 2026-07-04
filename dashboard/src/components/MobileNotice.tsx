import { useState, useEffect } from 'react'
import { Monitor, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileNoticeProps {
  pageKey: string
  message?: string
}

export function MobileNotice({ pageKey, message }: MobileNoticeProps) {
  const storageKey = `df-pc-notice-${pageKey}`
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissed = sessionStorage.getItem(storageKey) === '1'
    setVisible(!dismissed)
  }, [storageKey])

  const dismiss = () => {
    sessionStorage.setItem(storageKey, '1')
    setVisible(false)
  }

  if (!visible) return null

  const defaultMsg = 'This page works best on a desktop browser. On mobile, go to your browser menu → "Desktop site" for full functionality.'

  return (
    <div className={cn(
      'lg:hidden flex items-start gap-3 px-4 py-3 rounded-lg border',
      'bg-blue-500/10 border-blue-500/20 text-blue-400 text-xs leading-relaxed',
      'animate-fade-in mb-4'
    )}>
      <Monitor size={14} className="flex-shrink-0 mt-0.5" />
      <p className="flex-1">{message ?? defaultMsg}</p>
      <button
        onClick={dismiss}
        className="flex-shrink-0 text-blue-400/60 hover:text-blue-400 transition-colors p-0.5"
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  )
}
