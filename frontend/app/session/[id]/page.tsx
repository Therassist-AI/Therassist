'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import ConversationPanel from '@/components/ConversationPanel'
import EmotionPanel from '@/components/EmotionPanel'

export default function SessionPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.id as string
  const { cameraEnabled, setSessionId } = useStore()
  
  // Initialize session
  useEffect(() => {
    setSessionId(sessionId)
  }, [sessionId, setSessionId])
  
  // WebSocket connection for emotions
  useWebSocket(cameraEnabled)
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-6">
        <div className="mb-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Session</h1>
          <div className="text-sm text-gray-600">ID: {sessionId}</div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ConversationPanel sessionId={sessionId} />
          <EmotionPanel />
        </div>
      </div>
    </div>
  )
}
