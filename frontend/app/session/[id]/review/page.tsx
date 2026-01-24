'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useStore } from '@/lib/store'
import { computeEmotionAggregate } from '@/lib/utils'

const API_BASE = 'http://localhost:8000'

interface Summary {
  main_topics: string[]
  reported_stressors: string[]
  coping_strategies_mentioned: string[]
  supports_mentioned: string[]
  goals_before_next_session: string[]
  questions_for_therapist: string[]
  observed_emotion_signals: any[]
  user_quote_highlights: string[]
  user_editable_summary: string
}

export default function ReviewPage() {
  const params = useParams()
  const sessionId = params.id as string
  const { transcript, emotionHistory } = useStore()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [editableSummary, setEditableSummary] = useState('')
  
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const emotionAggregate = computeEmotionAggregate(emotionHistory)
        
        const response = await fetch(`${API_BASE}/api/summarize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            transcript,
            emotion_aggregate: emotionAggregate
          })
        })
        
        const data = await response.json()
        setSummary(data)
        setEditableSummary(data.user_editable_summary || '')
      } catch (error) {
        console.error('Summary error:', error)
        // Fallback summary
        const emotionAggregate = computeEmotionAggregate(emotionHistory)
        setSummary({
          main_topics: [],
          reported_stressors: [],
          coping_strategies_mentioned: [],
          supports_mentioned: [],
          goals_before_next_session: [],
          questions_for_therapist: [],
          observed_emotion_signals: emotionAggregate.top_emotions,
          user_quote_highlights: transcript.split('\n').filter(l => l.trim()).slice(0, 3),
          user_editable_summary: `Session transcript:\n${transcript}\n\nEmotion signals: ${JSON.stringify(emotionAggregate)}`
        })
        setEditableSummary(`Session transcript:\n${transcript}\n\nEmotion signals: ${JSON.stringify(emotionAggregate)}`)
      } finally {
        setLoading(false)
      }
    }
    
    if (transcript || emotionHistory.length > 0) {
      fetchSummary()
    } else {
      setLoading(false)
    }
  }, [sessionId, transcript, emotionHistory])
  
  const handleCopy = () => {
    const text = summary ? JSON.stringify(summary, null, 2) : editableSummary
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
  }
  
  const handleDownload = () => {
    const text = summary ? JSON.stringify(summary, null, 2) : editableSummary
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `therassist_session_${sessionId}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-semibold mb-2">Generating summary...</div>
          <div className="text-gray-600">Please wait</div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Session Review</h1>
        
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
          <p className="text-sm text-blue-800">
            <strong>Privacy Note:</strong> This summary is generated locally. You control all sharing. 
            Nothing is sent automatically. Review and edit as needed before sharing with your therapist.
          </p>
        </div>
        
        {summary && (
          <div className="bg-white rounded-lg shadow-md p-6 space-y-6 mb-6">
            <h2 className="text-2xl font-semibold text-gray-800">Summary</h2>
            
            {summary.main_topics && summary.main_topics.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">Main Topics</h3>
                <ul className="list-disc list-inside text-gray-600">
                  {summary.main_topics.map((topic, idx) => (
                    <li key={idx}>{topic}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {summary.reported_stressors && summary.reported_stressors.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">Reported Stressors</h3>
                <ul className="list-disc list-inside text-gray-600">
                  {summary.reported_stressors.map((stressor, idx) => (
                    <li key={idx}>{stressor}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {summary.coping_strategies_mentioned && summary.coping_strategies_mentioned.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">Coping Strategies Mentioned</h3>
                <ul className="list-disc list-inside text-gray-600">
                  {summary.coping_strategies_mentioned.map((strategy, idx) => (
                    <li key={idx}>{strategy}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {summary.supports_mentioned && summary.supports_mentioned.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">Supports Mentioned</h3>
                <ul className="list-disc list-inside text-gray-600">
                  {summary.supports_mentioned.map((support, idx) => (
                    <li key={idx}>{support}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {summary.goals_before_next_session && summary.goals_before_next_session.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">Goals Before Next Session</h3>
                <ul className="list-disc list-inside text-gray-600">
                  {summary.goals_before_next_session.map((goal, idx) => (
                    <li key={idx}>{goal}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {summary.questions_for_therapist && summary.questions_for_therapist.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">Questions for Therapist</h3>
                <ul className="list-disc list-inside text-gray-600">
                  {summary.questions_for_therapist.map((question, idx) => (
                    <li key={idx}>{question}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {summary.observed_emotion_signals && summary.observed_emotion_signals.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">Observed Emotion Signals</h3>
                <div className="text-gray-600 text-sm">
                  <p className="mb-2">Note: These are weak signals only, not diagnoses.</p>
                  <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                    {JSON.stringify(summary.observed_emotion_signals, null, 2)}
                  </pre>
                </div>
              </div>
            )}
            
            {summary.user_quote_highlights && summary.user_quote_highlights.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">Notable Quotes</h3>
                <ul className="list-disc list-inside text-gray-600">
                  {summary.user_quote_highlights.map((quote, idx) => (
                    <li key={idx} className="italic">"{quote}"</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Editable Summary</h2>
          <textarea
            value={editableSummary}
            onChange={(e) => setEditableSummary(e.target.value)}
            className="w-full h-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Edit your summary here..."
          />
        </div>
        
        <div className="flex space-x-4">
          <button
            onClick={handleCopy}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
          >
            Copy to Clipboard
          </button>
          <button
            onClick={handleDownload}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700"
          >
            Download as .txt
          </button>
        </div>
      </div>
    </div>
  )
}
