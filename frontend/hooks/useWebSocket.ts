import { useState, useEffect, useRef, useCallback } from "react";

interface TopEmotion {
  emotion: string;
  count: number;
  percentage: number;
}

interface UseWebSocketReturn {
  currentEmotion: string | null;
  confidence: number;
  isConnected: boolean;
  error: string | null;
}

export function useWebSocket(
  isActive: boolean,
  onSessionEnd: (emotions: TopEmotion[], readings: number) => void
): UseWebSocketReturn {
  const [currentEmotion, setCurrentEmotion] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onSessionEndRef = useRef(onSessionEnd);

  // Keep callback ref updated
  useEffect(() => {
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionEnd]);

  useEffect(() => {
    if (!isActive) {
      // Close connection when session stops
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      setCurrentEmotion(null);
      setConfidence(0);
      return;
    }

    // Open WebSocket connection
    const ws = new WebSocket("ws://localhost:8000/ws/emotions");
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
        } else if (data.status === "no_face") {
          // Keep last emotion displayed
        } else if (data.status === "session_end") {
          onSessionEndRef.current(data.top_emotions || [], data.total_readings || 0);
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
    };

    return () => {
      ws.close();
    };
  }, [isActive]);

  return { currentEmotion, confidence, isConnected, error };
}
