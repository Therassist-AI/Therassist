export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function computeEmotionAggregate(emotionHistory: Array<{ dominant?: string; confidence?: number; probs?: Record<string, number> }>) {
  const validEmotions = emotionHistory.filter(e => e.status === 'ok' && e.dominant)
  
  if (validEmotions.length === 0) {
    return {
      top_emotions: [],
      volatility: 0,
      notable_spikes: []
    }
  }
  
  // Count dominant emotions
  const emotionCounts: Record<string, number> = {}
  const emotionConfidences: Record<string, number[]> = {}
  
  validEmotions.forEach(e => {
    if (e.dominant) {
      emotionCounts[e.dominant] = (emotionCounts[e.dominant] || 0) + 1
      if (e.confidence) {
        if (!emotionConfidences[e.dominant]) {
          emotionConfidences[e.dominant] = []
        }
        emotionConfidences[e.dominant].push(e.confidence)
      }
    }
  })
  
  // Top emotions by frequency
  const top_emotions = Object.entries(emotionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([emotion, count]) => ({
      emotion,
      frequency: count,
      avg_confidence: emotionConfidences[emotion] 
        ? emotionConfidences[emotion].reduce((a, b) => a + b, 0) / emotionConfidences[emotion].length 
        : 0
    }))
  
  // Volatility: dominant changes per minute
  let changes = 0
  for (let i = 1; i < validEmotions.length; i++) {
    if (validEmotions[i].dominant !== validEmotions[i - 1].dominant) {
      changes++
    }
  }
  const durationMinutes = validEmotions.length / 2 / 60 // 2 FPS
  const volatility = durationMinutes > 0 ? changes / durationMinutes : 0
  
  // Notable spikes (confidence > 0.7 and different from previous)
  const notable_spikes = []
  for (let i = 1; i < validEmotions.length; i++) {
    const curr = validEmotions[i]
    const prev = validEmotions[i - 1]
    if (curr.confidence && curr.confidence > 0.7 && curr.dominant !== prev.dominant) {
      notable_spikes.push({
        emotion: curr.dominant,
        confidence: curr.confidence,
        timestamp: curr.ts || Date.now()
      })
    }
  }
  
  return {
    top_emotions,
    volatility: Math.round(volatility * 100) / 100,
    notable_spikes
  }
}
