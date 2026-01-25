import { useState, useRef, useCallback } from "react";

interface UseAudioRecorderReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  error: string | null;
  audioLevel: number;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      chunksRef.current = [];

      // Request microphone access with specific audio settings
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 1
        } 
      });
      streamRef.current = stream;

      // Set up audio analyser to monitor audio levels (visual feedback)
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Monitor audio levels
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const checkAudioLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setAudioLevel(average);
          animationRef.current = requestAnimationFrame(checkAudioLevel);
        }
      };
      checkAudioLevel();

      // Create MediaRecorder with best available format
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType,
        audioBitsPerSecond: 128000 // 128 kbps for good quality
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
          console.log(`Audio chunk received: ${event.data.size} bytes, total chunks: ${chunksRef.current.length}`);
        }
      };

      // Start recording - use smaller timeslice (250ms) for more frequent data collection
      mediaRecorder.start(250);
      setIsRecording(true);
      console.log("Recording started with mimeType:", mimeType);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start recording";
      setError(message);
      console.error("Recording error:", err);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      // Cancel audio level monitoring
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      setAudioLevel(0);

      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
        setIsRecording(false);
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
        
        console.log(`Creating blob from ${chunksRef.current.length} chunks`);
        const totalSize = chunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0);
        console.log(`Total audio data size: ${totalSize} bytes`);
        
        const blob = new Blob(chunksRef.current, { type: mimeType });
        console.log(`Final blob size: ${blob.size} bytes`);
        
        chunksRef.current = [];
        
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        setIsRecording(false);
        resolve(blob);
      };

      // Request final data before stopping
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.requestData();
      }
      
      mediaRecorderRef.current.stop();
    });
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    error,
    audioLevel,
  };
}
