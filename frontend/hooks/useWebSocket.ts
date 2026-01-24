import { useEffect, useRef } from 'react'
import { useStore, EmotionData } from '@/lib/store'

export function useWebSocket(enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null)
  const { addEmotion } = useStore()
  
  useEffect(() => {
    if (!enabled) {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      return
    }
    
    const ws = new WebSocket('ws://localhost:8000/ws/emotions')
    wsRef.current = ws
    
    ws.onopen = () => {
      console.log('WebSocket connected')
    }
    
    ws.onmessage = (event) => {
      try {
        const data: EmotionData = JSON.parse(event.data)
        addEmotion(data)
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
    
    ws.onclose = () => {
      console.log('WebSocket disconnected')
    }
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [enabled, addEmotion])
}
