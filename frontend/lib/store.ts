import { create } from 'zustand'

export interface EmotionData {
  ts: number
  status: 'ok' | 'no_face'
  dominant?: string
  confidence?: number
  probs?: Record<string, number>
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface SessionState {
  sessionId: string | null
  cameraEnabled: boolean
  micEnabled: boolean
  consentGiven: boolean
  messages: Message[]
  emotionHistory: EmotionData[]
  transcript: string
  stage: 'start' | 'middle' | 'end'
  videoFrame: string | null
  
  setSessionId: (id: string) => void
  setCameraEnabled: (enabled: boolean) => void
  setMicEnabled: (enabled: boolean) => void
  setConsentGiven: (given: boolean) => void
  addMessage: (message: Message) => void
  addEmotion: (emotion: EmotionData) => void
  appendTranscript: (text: string) => void
  setStage: (stage: 'start' | 'middle' | 'end') => void
  setVideoFrame: (frame: string | null) => void
  reset: () => void
}

export const useStore = create<SessionState>((set) => ({
  sessionId: null,
  cameraEnabled: false,
  micEnabled: false,
  consentGiven: false,
  messages: [],
  emotionHistory: [],
  transcript: '',
  stage: 'start',
  videoFrame: null,
  
  setSessionId: (id) => set({ sessionId: id }),
  setCameraEnabled: (enabled) => set({ cameraEnabled: enabled }),
  setMicEnabled: (enabled) => set({ micEnabled: enabled }),
  setConsentGiven: (given) => set({ consentGiven: given }),
  addMessage: (message) => set((state) => ({ 
    messages: [...state.messages, message] 
  })),
  addEmotion: (emotion) => set((state) => {
    const history = [...state.emotionHistory, emotion]
    // Keep last 120 points (60 seconds at 2 FPS)
    return { emotionHistory: history.slice(-120) }
  }),
  appendTranscript: (text) => set((state) => ({
    transcript: state.transcript ? `${state.transcript}\n${text}` : text
  })),
  setStage: (stage) => set({ stage }),
  setVideoFrame: (frame) => set({ videoFrame: frame }),
  reset: () => set({
    sessionId: null,
    cameraEnabled: false,
    micEnabled: false,
    consentGiven: false,
    messages: [],
    emotionHistory: [],
    transcript: '',
    stage: 'start',
    videoFrame: null
  })
}))
