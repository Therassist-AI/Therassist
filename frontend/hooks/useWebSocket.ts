import { useEffect, useRef } from 'react'
import { useStore, EmotionData } from '@/lib/store'

export function useWebSocket(enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null)
  const { addEmotion, setVideoFrame } = useStore()
  
  useEffect(() => {
    if (!enabled) {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      setVideoFrame(null)
      return
    }
    
    const ws = new WebSocket('ws://localhost:8000/ws/emotions')
    wsRef.current = ws
    
    ws.onopen = () => {
      console.log('WebSocket connected')
      console.log('Waiting for video frames...')
    }
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        // Handle frame messages
        if (data.type === 'frame' && data.frame) {
          console.log('Received video frame')
          setVideoFrame(`data:image/jpeg;base64,${data.frame}`)
        } 
        // Handle connection messages
        else if (data.status === 'connected') {
          console.log('Backend connected:', data.message)
        }
        // Handle emotion data messages
        else if (data.status) {
          const emotionData: EmotionData = {
            ts: data.ts,
            status: data.status,
            dominant: data.dominant,
            confidence: data.confidence,
            probs: data.probs
          }
          addEmotion(emotionData)
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
    
    ws.onclose = () => {
      console.log('WebSocket disconnected')
      setVideoFrame(null)
    }
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      setVideoFrame(null)
    }
  }, [enabled, addEmotion, setVideoFrame])
}
