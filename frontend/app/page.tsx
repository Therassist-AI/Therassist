"use client";

import { useState, useEffect, useCallback } from "react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useSessionWebSocket } from "@/hooks/useSessionWebSocket";

const API_BASE = "http://localhost:8000";

interface TopEmotion {
  emotion: string;
  count: number;
  percentage: number;
}

interface TranscriptItem {
  question_number: number;
  question: string;
  transcript: string;
}

interface SessionSummary {
  session_id: string;
  total_readings: number;
  overall_top_emotions: TopEmotion[];
  per_question: {
    question_number: number;
    question: string;
    emotion_count: number;
    top_emotions: TopEmotion[];
  }[];
}

type SessionState = "idle" | "waiting-for-face" | "recording" | "processing" | "complete" | "therapist-view";

export default function Home() {
  // Session state
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);
  
  // Results
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState("");
  
  // Hooks
  const { isRecording, startRecording, stopRecording, error: audioError, audioLevel } = useAudioRecorder();
  const { 
    currentEmotion, 
    confidence, 
    isConnected, 
    error: wsError, 
    emotions,
    connect: connectWebSocket,
    disconnect: disconnectWebSocket,
    notifyQuestionChange,
    clearEmotions
  } = useSessionWebSocket(sessionId);

  // Fetch questions on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/questions`)
      .then((res) => res.json())
      .then((data) => setQuestions(data.questions))
      .catch((err) => console.error("Failed to fetch questions:", err));
  }, []);

  const startSession = async () => {
    try {
      // Start backend session
      const res = await fetch(`${API_BASE}/api/session/start`, { method: "POST" });
      const data = await res.json();
      setSessionId(data.session_id);
      setCurrentQuestionIndex(0);
      setTranscripts([]);
      setSessionSummary(null);
      setReport(null);
      setFaceDetected(false);
      setSessionState("waiting-for-face");
    } catch (err) {
      console.error("Failed to start session:", err);
    }
  };

  // Connect WebSocket when sessionId is set and we're waiting for face or recording
  useEffect(() => {
    if (sessionId && (sessionState === "waiting-for-face" || sessionState === "recording")) {
      connectWebSocket();
    }
  }, [sessionId, sessionState, connectWebSocket]);

  // Monitor face detection and start recording when face is detected
  useEffect(() => {
    if (sessionState === "waiting-for-face" && currentEmotion && !faceDetected) {
      setFaceDetected(true);
    }
  }, [sessionState, currentEmotion, faceDetected]);

  // Start recording after face is detected
  useEffect(() => {
    if (sessionState === "waiting-for-face" && faceDetected) {
      const timer = setTimeout(() => {
        setSessionState("recording");
        startRecording();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [faceDetected, sessionState, startRecording]);

  const saveCurrentQuestionData = async (audioBlob: Blob | null) => {
    if (!sessionId) return;

    // Save audio
    if (audioBlob) {
      const formData = new FormData();
      formData.append("audio", audioBlob, `q${currentQuestionIndex}.webm`);
      
      await fetch(`${API_BASE}/api/session/${sessionId}/audio/${currentQuestionIndex}`, {
        method: "POST",
        body: formData,
      });
    }

    // Save emotions
    if (emotions.length > 0) {
      await fetch(`${API_BASE}/api/session/${sessionId}/emotions/${currentQuestionIndex}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emotions),
      });
    }
  };

  const nextQuestion = async () => {
    // Stop recording and get audio blob
    const audioBlob = await stopRecording();
    
    // Save current question data
    await saveCurrentQuestionData(audioBlob);
    
    // Clear emotions and notify WebSocket
    clearEmotions();
    
    if (currentQuestionIndex < questions.length - 1) {
      // Move to next question
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      notifyQuestionChange(nextIndex);
      
      // Start recording again
      await startRecording();
    } else {
      // Last question - end session
      await endSession();
    }
  };

  const endSession = async () => {
    setSessionState("processing");
    setProcessingStatus("Stopping recording...");
    
    // Disconnect WebSocket and stop recording
    disconnectWebSocket();
    
    if (!sessionId) return;

    try {
      // Transcribe all audio using local Whisper
      setProcessingStatus("Transcribing audio with Whisper (this may take a minute)...");
      
      const transcribeRes = await fetch(`${API_BASE}/api/session/${sessionId}/transcribe`, {
        method: "POST",
      });
      
      if (!transcribeRes.ok) {
        const error = await transcribeRes.json();
        throw new Error(error.detail || "Transcription failed");
      }
      
      const transcribeData = await transcribeRes.json();
      setTranscripts(transcribeData.transcripts);
      setReport(transcribeData.report || null);

      // Validate that files were created and have content
      const hasValidTranscript = transcribeData.transcript_path && 
        transcribeData.combined_transcript && 
        transcribeData.combined_transcript.length > 100;
      
      const hasValidReport = transcribeData.report_path && 
        transcribeData.report && 
        transcribeData.report.length > 100;

      if (!hasValidTranscript || !hasValidReport) {
        console.warn("Session data may be incomplete");
      }

      // Get session summary
      setProcessingStatus("Finalizing session...");
      const summaryRes = await fetch(`${API_BASE}/api/session/${sessionId}/summary`);
      const summaryData = await summaryRes.json();
      setSessionSummary(summaryData);

      setSessionState("complete");
    } catch (err) {
      console.error("Failed to process session:", err);
      setProcessingStatus(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const resetSession = () => {
    setSessionState("idle");
    setSessionId(null);
    setCurrentQuestionIndex(0);
    setTranscripts([]);
    setSessionSummary(null);
    setReport(null);
    setProcessingStatus("");
  };

  const error = audioError || wsError;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Therassist</h1>
          <p className="text-purple-200">AI-Powered Therapy Session</p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
          
          {/* IDLE STATE */}
          {sessionState === "idle" && (
            <div className="text-center">
              <div className="mb-6">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-purple-500/20 border-2 border-purple-400/50 flex items-center justify-center">
                  <svg className="w-10 h-10 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">Ready to Begin</h2>
                <p className="text-purple-200 text-sm mb-4">
                  Answer {questions.length} questions while we track your emotions
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

          {/* WAITING FOR FACE STATE */}
          {sessionState === "waiting-for-face" && (
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-blue-500/20 border-2 border-blue-400 flex items-center justify-center">
                {faceDetected ? (
                  <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-10 h-10 text-blue-300 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">
                {faceDetected ? "Face Detected!" : "Looking for your face..."}
              </h2>
              <p className="text-purple-200">
                {faceDetected ? "Starting session..." : "Please position yourself in front of the camera"}
              </p>
              <div className="mt-4 text-sm text-purple-300">
                {isConnected ? "🟢 Camera connected" : "🔴 Connecting to camera..."}
              </div>
            </div>
          )}

          {/* RECORDING STATE */}
          {sessionState === "recording" && (
            <div>
              {/* Progress indicator */}
              <div className="mb-6">
                <div className="flex justify-between text-purple-200 text-sm mb-2">
                  <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
                  <span>{isConnected ? "🟢 Tracking" : "🔴 Connecting..."}</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-green-400 to-emerald-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Question */}
              <div className="mb-6 p-6 bg-white/10 rounded-xl border border-white/20">
                <p className="text-purple-300 text-sm mb-2">Question {currentQuestionIndex + 1}</p>
                <p className="text-white text-lg">{questions[currentQuestionIndex]}</p>
              </div>

              {/* Recording indicator with audio level */}
              <div className="flex flex-col items-center justify-center gap-3 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-red-300">Recording...</span>
                </div>
                {/* Audio level meter */}
                <div className="w-48 h-3 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-100"
                    style={{ width: `${Math.min(100, audioLevel * 2)}%` }}
                  ></div>
                </div>
                <p className="text-purple-300 text-xs">
                  {audioLevel > 10 ? "🎤 Audio detected" : "🔇 Speak into your microphone"}
                </p>
              </div>

              {/* Emotion tracking status - don't show actual emotions to user */}
              <div className="mb-6 p-4 bg-white/10 rounded-xl border border-white/20 text-center">
                <p className="text-purple-200 text-sm mb-1">Emotion Tracking</p>
                {isConnected && currentEmotion ? (
                  <p className="text-xl font-bold text-green-400">✓ Active</p>
                ) : (
                  <p className="text-xl font-bold text-yellow-400">⟳ Initializing...</p>
                )}
              </div>

              {/* Error display */}
              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-400/50 rounded-lg">
                  <p className="text-red-200 text-sm">{error}</p>
                </div>
              )}

              {/* Navigation buttons */}
              <div className="flex gap-4">
                <button
                  onClick={nextQuestion}
                  className="flex-1 py-3 px-6 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  {currentQuestionIndex < questions.length - 1 ? "Next Question →" : "Finish Session"}
                </button>
              </div>
            </div>
          )}

          {/* PROCESSING STATE */}
          {sessionState === "processing" && (
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-blue-500/20 border-2 border-blue-400 flex items-center justify-center">
                <svg className="w-10 h-10 text-blue-300 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Processing Session</h2>
              <p className="text-purple-200">{processingStatus}</p>
            </div>
          )}

          {/* COMPLETE STATE */}
          {sessionState === "complete" && (
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center">
                <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-white mb-2">Session Complete</h2>
              <p className="text-purple-200 mb-6">
                Thank you for completing your session. Your responses have been recorded.
              </p>
              
              <div className="space-y-3">
                <button
                  onClick={() => setSessionState("therapist-view")}
                  className="w-full py-3 px-6 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  🔒 Therapist View
                </button>
                
                <button
                  onClick={resetSession}
                  className="w-full py-3 px-6 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  Start New Session
                </button>
              </div>
            </div>
          )}

          {/* THERAPIST VIEW STATE */}
          {sessionState === "therapist-view" && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-white">Therapist View</h2>
                <button
                  onClick={() => setSessionState("complete")}
                  className="text-purple-300 hover:text-white transition-colors"
                >
                  ← Back
                </button>
              </div>
              
              {/* Overall emotions */}
              {sessionSummary && sessionSummary.overall_top_emotions.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-purple-200 mb-3">Overall Emotions</h3>
                  <div className="space-y-2">
                    {sessionSummary.overall_top_emotions.map((item, index) => (
                      <div
                        key={item.emotion}
                        className={`p-3 rounded-xl ${
                          index === 0
                            ? "bg-gradient-to-r from-yellow-500/30 to-orange-500/30 border border-yellow-400/50"
                            : "bg-white/10 border border-white/20"
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-white font-medium capitalize">
                            {index === 0 && "🥇 "}
                            {index === 1 && "🥈 "}
                            {item.emotion}
                          </span>
                          <span className="text-purple-200 font-bold">{item.percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Clinical Report */}
              {report && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-purple-200 mb-3">📋 Clinical Report</h3>
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10 max-h-96 overflow-y-auto">
                    <pre className="text-white text-sm whitespace-pre-wrap font-sans">{report}</pre>
                  </div>
                </div>
              )}

              <button
                onClick={resetSession}
                className="w-full py-3 px-6 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                Start New Session
              </button>
            </div>
          )}
        </div>

        {/* Session ID display */}
        {sessionId && (
          <div className="mt-4 text-center text-purple-300 text-sm">
            Session: {sessionId}
          </div>
        )}
      </div>
    </div>
  );
}
