'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { generateSessionId } from '@/lib/utils'

export default function ConsentPage() {
  const router = useRouter()
  const { setSessionId, setCameraEnabled, setMicEnabled, setConsentGiven, cameraEnabled, micEnabled } = useStore()
  const [consentChecked, setConsentChecked] = useState(false)
  
  const handleStart = () => {
    if (!consentChecked) {
      alert('Please acknowledge the consent statement before starting.')
      return
    }
    
    const sessionId = generateSessionId()
    setSessionId(sessionId)
    setConsentGiven(true)
    router.push(`/session/${sessionId}`)
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl p-8 space-y-6">
        <h1 className="text-4xl font-bold text-center text-gray-800">Therassist</h1>
        <p className="text-center text-gray-600">An opt-in guided check-in tool</p>
        
        <div className="bg-red-50 border-l-4 border-red-500 p-4 my-6">
          <p className="text-sm text-red-800 font-semibold">
            ⚠️ Not for emergencies. Not medical advice. If you are in crisis, please contact local emergency services or a trusted person.
          </p>
        </div>
        
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-800">Privacy & Consent</h2>
          <p className="text-gray-700 text-sm">
            This tool processes your audio and video locally. No raw video or audio is sent to servers. 
            Only transcribed text and aggregated emotion signals are processed. You control all data sharing.
          </p>
          
          <div className="space-y-3">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={cameraEnabled}
                onChange={(e) => setCameraEnabled(e.target.checked)}
                className="w-5 h-5 text-indigo-600 rounded"
              />
              <span className="text-gray-700">Enable camera for emotion signals (processed locally)</span>
            </label>
            
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={micEnabled}
                onChange={(e) => setMicEnabled(e.target.checked)}
                className="w-5 h-5 text-indigo-600 rounded"
              />
              <span className="text-gray-700">Enable microphone for voice recording</span>
            </label>
          </div>
          
          <div className="bg-gray-50 p-4 rounded border">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="w-5 h-5 text-indigo-600 rounded mt-1"
              />
              <span className="text-gray-700 text-sm">
                I acknowledge that this tool is not a substitute for professional therapy or medical care. 
                I understand that my data is processed locally and I control all sharing. I consent to using this tool.
              </span>
            </label>
          </div>
        </div>
        
        <button
          onClick={handleStart}
          disabled={!consentChecked}
          className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          Start Session
        </button>
      </div>
    </div>
  )
}
