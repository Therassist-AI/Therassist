'use client'

import { useStore } from '@/lib/store'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const EMOTION_COLORS: Record<string, string> = {
  angry: '#ef4444',
  disgust: '#84cc16',
  fear: '#f59e0b',
  happy: '#10b981',
  sad: '#3b82f6',
  surprise: '#8b5cf6',
  neutral: '#6b7280'
}

export default function EmotionPanel() {
  const { emotionHistory, cameraEnabled } = useStore()
  
  const recentEmotions = emotionHistory.slice(-60) // Last 60 data points for 30 seconds at 2 FPS
  
  const chartData = recentEmotions
    .filter(e => e.status === 'ok' && e.dominant)
    .map((e, idx) => ({
      time: idx,
      emotion: e.dominant,
      confidence: e.confidence || 0,
      timestamp: e.ts
    }))
  
  const currentEmotion = emotionHistory.slice(-1)[0]
  const isNoFace = currentEmotion?.status === 'no_face' || !currentEmotion
  
  if (!cameraEnabled) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Emotion Signals</h2>
        <div className="text-center text-gray-500 py-8">
          <p>Camera is disabled</p>
          <p className="text-sm mt-2">Enable camera in settings to see emotion signals</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Emotion Signals</h2>
      
      {isNoFace ? (
        <div className="text-center py-8">
          <div className="text-gray-500 mb-2">No face detected</div>
          <div className="text-sm text-gray-400">Please ensure your face is visible to the camera</div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-3xl font-bold mb-2" style={{ color: EMOTION_COLORS[currentEmotion.dominant || 'neutral'] }}>
              {currentEmotion.dominant?.toUpperCase() || 'NEUTRAL'}
            </div>
            <div className="text-sm text-gray-600">
              Confidence: {((currentEmotion.confidence || 0) * 100).toFixed(0)}%
            </div>
          </div>
          
          {chartData.length > 0 && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis domain={[0, 1]} />
                  <Tooltip
                    formatter={(value: number, name: string, props: any) => {
                      if (name === 'confidence') {
                        return [`${(value * 100).toFixed(0)}%`, 'Confidence']
                      }
                      return [props.payload.emotion, 'Emotion']
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="confidence"
                    stroke="#8884d8"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          
          <div className="text-xs text-gray-500 text-center">
            Real-time emotion analysis (5-second smoothing window)
          </div>
        </div>
      )}
    </div>
  )
}
