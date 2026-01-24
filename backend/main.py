import os
import json
import time
import asyncio
from collections import deque
from typing import Optional, Dict, List, Any
from datetime import datetime

import cv2
import numpy as np
from deepface import DeepFace
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Therassist API")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Environment variables
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DETECTOR_BACKEND = os.getenv("DETECTOR_BACKEND", "ssd")

# Global camera state
active_cameras: Dict[str, cv2.VideoCapture] = {}

# Request models
class ChatRequest(BaseModel):
    session_id: str
    stage: str
    messages: List[Dict[str, str]]
    emotion_hint: Optional[str] = None

class SummarizeRequest(BaseModel):
    session_id: str
    transcript: str
    emotion_aggregate: Dict[str, Any]

class TranscribeRequest(BaseModel):
    text: Optional[str] = None

# LLM helpers
async def call_gemini_chat(messages: List[Dict[str, str]], emotion_hint: Optional[str] = None) -> str:
    """Call Gemini for conversation agent."""
    if not GEMINI_API_KEY:
        return None
    
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-pro')
        
        system_prompt = """You are a supportive, reflective conversation agent. You are NOT providing therapy or medical advice. You are NOT diagnosing anything.

Guidelines:
- Keep responses under 3 sentences
- Ask at most 1 question per response
- Be reflective and neutral
- If the user expresses immediate danger or crisis, respond with empathy and encourage them to contact local emergency services or a trusted person, without giving instructions

Be brief, supportive, and ask gentle open-ended questions."""
        
        conversation_text = system_prompt + "\n\nConversation:\n"
        for msg in messages[-5:]:  # Last 5 messages for context
            role = msg.get("role", "user")
            content = msg.get("content", "")
            conversation_text += f"{role}: {content}\n"
        
        if emotion_hint:
            conversation_text += f"\n[Observed emotion signal: {emotion_hint} - use this only as weak context, not diagnosis]\n"
        
        response = model.generate_content(conversation_text)
        return response.text.strip()
    except Exception as e:
        print(f"Gemini chat error: {e}")
        return None

async def call_gemini_summarize(transcript: str, emotion_aggregate: Dict[str, Any]) -> Dict[str, Any]:
    """Call Gemini for summary agent."""
    if not GEMINI_API_KEY:
        return None
    
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-pro')
        
        system_prompt = """You are a neutral summary agent. Generate a structured summary in valid JSON format only.

Guidelines:
- NO diagnosis or medical interpretation
- Use only what the user explicitly said
- Treat emotion data as weak "observed emotion signals" only
- Output valid JSON matching this exact schema:
{
  "main_topics": [],
  "reported_stressors": [],
  "coping_strategies_mentioned": [],
  "supports_mentioned": [],
  "goals_before_next_session": [],
  "questions_for_therapist": [],
  "observed_emotion_signals": [],
  "user_quote_highlights": [],
  "user_editable_summary": ""
}

Output ONLY the JSON, no other text."""
        
        prompt = f"""{system_prompt}

Transcript:
{transcript}

Emotion aggregate (weak signals only):
{json.dumps(emotion_aggregate, indent=2)}

Generate the summary JSON:"""
        
        response = model.generate_content(prompt)
        text = response.text.strip()
        
        # Extract JSON from response
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        
        return json.loads(text)
    except Exception as e:
        print(f"Gemini summarize error: {e}")
        return None

def get_stub_chat_response(stage: str) -> str:
    """Deterministic stub response when no LLM is configured."""
    prompts = {
        "start": "How are you feeling today?",
        "middle": "What's on your mind right now?",
        "end": "Is there anything else you'd like to share?",
    }
    return prompts.get(stage, "How can I support you today?")

def get_stub_summary(transcript: str, emotion_aggregate: Dict[str, Any]) -> Dict[str, Any]:
    """Simple stub summary when no LLM is configured."""
    lines = [line.strip() for line in transcript.split("\n") if line.strip()]
    
    return {
        "main_topics": ["Session conversation"],
        "reported_stressors": [],
        "coping_strategies_mentioned": [],
        "supports_mentioned": [],
        "goals_before_next_session": [],
        "questions_for_therapist": [],
        "observed_emotion_signals": emotion_aggregate.get("top_emotions", []),
        "user_quote_highlights": lines[:3] if lines else [],
        "user_editable_summary": f"Session transcript:\n{transcript}\n\nEmotion signals: {emotion_aggregate.get('top_emotions', [])}"
    }

# Emotion processing
def process_emotion_result(result: Any) -> Optional[Dict[str, float]]:
    """Extract emotion probabilities from DeepFace result."""
    if isinstance(result, list):
        if len(result) > 0:
            result = result[0]
        else:
            return None
    
    if isinstance(result, dict):
        emotions = result.get("emotion", {})
        if isinstance(emotions, dict):
            return emotions
        elif isinstance(emotions, str):
            # Sometimes DeepFace returns dominant emotion as string
            return None
    
    return None

# WebSocket endpoint
@app.websocket("/ws/emotions")
async def websocket_emotions(websocket: WebSocket):
    await websocket.accept()
    camera = None
    emotion_window = deque(maxlen=10)  # Last 10 results for 5-second window at 2 FPS
    
    try:
        # Open camera
        camera = cv2.VideoCapture(0)
        if not camera.isOpened():
            await websocket.send_json({"status": "error", "message": "Could not open camera"})
            return
        
        last_analysis_time = 0
        analysis_interval = 0.5  # 500ms = 2 FPS
        
        while True:
            ret, frame = camera.read()
            if not ret:
                await websocket.send_json({"status": "error", "message": "Failed to read frame"})
                break
            
            current_time = time.time()
            
            # Only analyze every 500ms
            if current_time - last_analysis_time >= analysis_interval:
                # Resize frame to 50% for speed
                height, width = frame.shape[:2]
                small_frame = cv2.resize(frame, (width // 2, height // 2))
                
                # Convert BGR to RGB
                rgb_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
                
                try:
                    # Analyze with DeepFace
                    result = DeepFace.analyze(
                        rgb_frame,
                        actions=['emotion'],
                        detector_backend=DETECTOR_BACKEND,
                        enforce_detection=False,
                        silent=True
                    )
                    
                    probs = process_emotion_result(result)
                    
                    if probs:
                        emotion_window.append(probs)
                        
                        # Compute average probabilities
                        if emotion_window:
                            avg_probs = {}
                            for key in probs.keys():
                                avg_probs[key] = np.mean([d.get(key, 0) for d in emotion_window])
                            
                            # Find dominant emotion
                            dominant = max(avg_probs.items(), key=lambda x: x[1])[0]
                            confidence = avg_probs[dominant]
                            
                            # Send result
                            await websocket.send_json({
                                "ts": int(time.time() * 1000),
                                "status": "ok",
                                "dominant": dominant,
                                "confidence": round(confidence, 2),
                                "probs": {k: round(v, 2) for k, v in avg_probs.items()},
                                "window_seconds": 5
                            })
                        else:
                            await websocket.send_json({
                                "ts": int(time.time() * 1000),
                                "status": "no_face"
                            })
                    else:
                        await websocket.send_json({
                            "ts": int(time.time() * 1000),
                            "status": "no_face"
                        })
                
                except Exception as e:
                    print(f"DeepFace error: {e}")
                    await websocket.send_json({
                        "ts": int(time.time() * 1000),
                        "status": "no_face"
                    })
                
                last_analysis_time = current_time
            
            # Small delay to prevent CPU overload
            await asyncio.sleep(0.05)
    
    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"status": "error", "message": str(e)})
        except:
            pass
    finally:
        # Release camera
        if camera is not None:
            camera.release()
            print("Camera released")

# REST endpoints
@app.post("/api/transcribe")
async def transcribe(
    file: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None)
):
    """Transcribe audio or accept typed text fallback."""
    if text:
        return {"transcript": text}
    
    if not file:
        return {"transcript": "(no transcription configured)"}
    
    # If STT is not configured, return fallback message
    # In a real implementation, you would use Whisper API, Google Speech-to-Text, etc.
    return {"transcript": "(no transcription configured - please use text input)"}

@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Conversation agent endpoint."""
    try:
        # Try Gemini first
        response = await call_gemini_chat(request.messages, request.emotion_hint)
        
        if response:
            return {"assistant_message": response}
        
        # Fallback to stub
        return {"assistant_message": get_stub_chat_response(request.stage)}
    
    except Exception as e:
        print(f"Chat error: {e}")
        return {"assistant_message": get_stub_chat_response(request.stage)}

@app.post("/api/summarize")
async def summarize(request: SummarizeRequest):
    """Summary agent endpoint."""
    try:
        # Try Gemini first
        summary = await call_gemini_summarize(request.transcript, request.emotion_aggregate)
        
        if summary:
            return summary
        
        # Fallback to stub
        return get_stub_summary(request.transcript, request.emotion_aggregate)
    
    except Exception as e:
        print(f"Summarize error: {e}")
        return get_stub_summary(request.transcript, request.emotion_aggregate)

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
