import { useEffect, useRef, useState, useCallback } from 'react'

export interface WsMessage {
  type: string
  job?: unknown
  ts?: number
  message?: string
}

export function useWebSocket(path: string, onMessage?: (msg: WsMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${window.location.host}${path}`
    const ws = new WebSocket(url)
    wsRef.current = ws
    ws.onopen = () => { if (mountedRef.current) setConnected(true) }
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage
        if (msg.type !== 'ping') onMessage?.(msg)
      } catch { /* ignore */ }
    }
    ws.onclose = () => {
      if (!mountedRef.current) return
      setConnected(false)
      reconnectTimer.current = setTimeout(() => connect(), 3000)
    }
    ws.onerror = () => ws.close()
  }, [path, onMessage])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { connected }
}
