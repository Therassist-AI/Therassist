'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStore, Message } from '@/lib/store'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'

const API_BASE = 'http://localhost:8000'

export default function ConversationPanel({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const { messages, addMessage, appendTranscript, transcript, stage, setStage, micEnabled } = useStore()
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  
  useEffect(() => {
    scrollToBottom()
  }, [messages])
  
  const handleRecordingComplete = async (blob: Blob) => {
    try {
      const formData = new FormData()
      formData.append('file', blob, 'recording.webm')
      
      const response = await fetch(`${API_BASE}/api/transcribe`, {
        method: 'POST',
        body: formData
      })
      
      const data = await response.json()
      const transcriptText = data.transcript || '(transcription unavailable)'
      
      appendTranscript(transcriptText)
      setInputText(transcriptText)
    } catch (error) {
      console.error('Transcription error:', error)
      setInputText('(transcription failed - please type your message)')
    }
  }
  
  const { isRecording, error: micError, startRecording, stopRecording } = useAudioRecorder(handleRecordingComplete)
  
  const sendMessage = async (text: string) => {
    if (!text.trim()) return
    
    const userMessage: Message = {
      role: 'user',
      content: text,
      timestamp: Date.now()
    }
    
    addMessage(userMessage)
    appendTranscript(text)
    setInputText('')
    setIsLoading(true)
    
    // Update stage based on message count
    const newStage = messages.length === 0 ? 'start' : messages.length < 5 ? 'middle' : 'end'
    setStage(newStage)
    
    try {
      // Get recent emotion hint
      const storeState = useStore.getState()
      const recentEmotion = storeState.emotionHistory.slice(-1)[0]
      const emotionHint = recentEmotion?.status === 'ok' ? recentEmotion.dominant : undefined
      
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          stage: newStage,
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
          emotion_hint: emotionHint
        })
      })
      
      const data = await response.json()
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.assistant_message || 'I hear you.',
        timestamp: Date.now()
      }
      
      addMessage(assistantMessage)
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: Message = {
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again.',
        timestamp: Date.now()
      }
      addMessage(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(inputText)
  }
  
  const handleEndSession = () => {
    router.push(`/session/${sessionId}/review`)
  }
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6 flex flex-col h-[600px]">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Conversation</h2>
      
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <p>Start the conversation by typing or recording a message.</p>
          </div>
        )}
        
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              <p className="text-sm">{msg.content}</p>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-lg px-4 py-2">
              <p className="text-sm text-gray-600">Thinking...</p>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {micError && (
        <div className="mb-2 text-sm text-red-600">{micError}</div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex space-x-2">
          {micEnabled && (
            <button
              type="button"
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isRecording
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              {isRecording ? '🎤 Recording...' : '🎤 Hold to Record'}
            </button>
          )}
          
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          
          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
      
      <button
        onClick={handleEndSession}
        className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700"
      >
        End Session
      </button>
    </div>
  )
}
