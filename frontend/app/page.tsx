"use client";

import { useState, useCallback } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";

interface TopEmotion {
  emotion: string;
  count: number;
  percentage: number;
}

export default function Home() {
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [topEmotions, setTopEmotions] = useState<TopEmotion[]>([]);
  const [totalReadings, setTotalReadings] = useState(0);

  const handleSessionEnd = useCallback((emotions: TopEmotion[], readings: number) => {
    setTopEmotions(emotions);
    setTotalReadings(readings);
    setSessionEnded(true);
    setSessionActive(false);
  }, []);

  const { currentEmotion, confidence, isConnected, error } = useWebSocket(
    sessionActive,
    handleSessionEnd
  );

  const startSession = () => {
    setSessionEnded(false);
    setTopEmotions([]);
    setSessionActive(true);
  };

  const stopSession = () => {
    setSessionActive(false);
  };

  const resetSession = () => {
    setSessionEnded(false);
    setTopEmotions([]);
    setTotalReadings(0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Therassist</h1>
          <p className="text-purple-200">AI-Powered Emotion Tracking</p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
          {sessionEnded && topEmotions.length > 0 && (
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-white mb-6">Session Complete</h2>
              <div className="mb-6">
                <p className="text-purple-200 text-sm mb-4">
                  Top 2 emotions from {totalReadings} readings:
                </p>
                <div className="space-y-3">
                  {topEmotions.map((item, index) => (
                    <div
                      key={item.emotion}
                      className={`p-4 rounded-xl ${
                        index === 0
                          ? "bg-gradient-to-r from-yellow-500/30 to-orange-500/30 border border-yellow-400/50"
                          : "bg-white/10 border border-white/20"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-white font-medium capitalize text-lg">
                          {index === 0 && "🥇 "}
                          {index === 1 && "🥈 "}
                          {item.emotion}
                        </span>
                        <span className="text-purple-200 font-bold text-xl">
                          {item.percentage}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={resetSession}
                className="w-full py-3 px-6 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                Start New Session
              </button>
            </div>
          )}

          {sessionActive && !sessionEnded && (
            <div className="text-center">
              <div className="mb-6">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center animate-pulse">
                  <div className="w-4 h-4 bg-green-400 rounded-full"></div>
                </div>
                <h2 className="text-xl font-semibold text-white">Session Active</h2>
                <p className="text-purple-200 text-sm mt-1">
                  {isConnected ? "Tracking emotions..." : "Connecting..."}
                </p>
              </div>

              {currentEmotion && (
                <div className="mb-6 p-4 bg-white/10 rounded-xl border border-white/20">
                  <p className="text-purple-200 text-sm mb-1">Current Emotion</p>
                  <p className="text-2xl font-bold text-white capitalize">{currentEmotion}</p>
                  <p className="text-purple-300 text-sm">{confidence}% confidence</p>
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-400/50 rounded-lg">
                  <p className="text-red-200 text-sm">{error}</p>
                </div>
              )}

              <button
                onClick={stopSession}
                className="w-full py-3 px-6 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                Stop Session
              </button>
            </div>
          )}

          {!sessionActive && !sessionEnded && (
            <div className="text-center">
              <div className="mb-6">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-purple-500/20 border-2 border-purple-400/50 flex items-center justify-center">
                  <svg className="w-10 h-10 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">Ready to Begin</h2>
                <p className="text-purple-200 text-sm">
                  Start a session to track your emotions in real-time
                </p>
              </div>

              <button
                onClick={startSession}
                className="w-full py-3 px-6 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                Start Session
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-purple-300/60 text-sm mt-6">
          Ensure your camera is enabled and face is visible
        </p>
      </div>
    </div>
  );
}
