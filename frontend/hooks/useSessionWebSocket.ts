import { useState, useEffect, useRef, useCallback } from "react";

interface EmotionRecord {
  ts: number;
  dominant: string;
  confidence: number;
  probs: Record<string, number>;
}

interface UseSessionWebSocketReturn {
  currentEmotion: string | null;
  confidence: number;
  isConnected: boolean;
  error: string | null;
  emotions: EmotionRecord[];
  connect: () => void;
  disconnect: () => void;
  notifyQuestionChange: (questionNumber: number) => void;
  clearEmotions: () => void;
}

export function useSessionWebSocket(sessionId: string | null): UseSessionWebSocketReturn {
  const [currentEmotion, setCurrentEmotion] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emotions, setEmotions] = useState<EmotionRecord[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!sessionId || wsRef.current) return;

    const ws = new WebSocket(`ws://localhost:8000/ws/emotions/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.status === "emotion") {
          setCurrentEmotion(data.dominant);
          setConfidence(data.confidence);
          setEmotions((prev) => [...prev, {
            ts: data.ts,
            dominant: data.dominant,
            confidence: data.confidence,
            probs: data.probs
          }]);
        } else if (data.status === "no_face") {
          // Keep last emotion displayed
        } else if (data.status === "question_changed") {
          // Reset emotions for new question
          setEmotions([]);
        } else if (data.status === "error") {
          setError(data.message);
        }
      } catch (e) {
        console.error("WebSocket message parse error:", e);
      }
    };

    ws.onerror = () => {
      setError("Connection error. Is the backend running?");
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
    };
  }, [sessionId]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      // Send stop signal before closing
      try {
        wsRef.current.send(JSON.stringify({ action: "stop" }));
      } catch (e) {
        // Ignore if connection already closed
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setCurrentEmotion(null);
    setConfidence(0);
  }, []);

  const notifyQuestionChange = useCallback((questionNumber: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        action: "next_question", 
        question_number: questionNumber 
      }));
    }
  }, []);

  const clearEmotions = useCallback(() => {
    setEmotions([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return { 
    currentEmotion, 
    confidence, 
    isConnected, 
    error, 
    emotions,
    connect,
    disconnect,
    notifyQuestionChange,
    clearEmotions
  };
}
