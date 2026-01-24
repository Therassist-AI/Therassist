import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # Suppress TensorFlow logs
os.environ['TF_USE_LEGACY_KERAS'] = '1'  # Use tf-keras for compatibility

import json
import time
import asyncio
import base64
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

# ========== CV CONFIGURATION ==========
SMOOTHING_WINDOW = 5        # Number of frames to average emotions over
FRAME_SKIP = 3              # Process every Nth frame (higher = faster but less responsive)
RESIZE_WIDTH = 640          # Resize frame for faster processing
FACE_PADDING = 30           # Pixels to add around detected face
# ===================================

# Environment variables
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DETECTOR_BACKEND = os.getenv("DETECTOR_BACKEND", "skip")  # Use 'skip' since we detect faces with OpenCV

# Initialize OpenCV Face Detection (Haar Cascade)
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

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
    
    # Emotion averaging system (matching working code)
    emotion_history = deque(maxlen=SMOOTHING_WINDOW)
    last_emotion = "neutral"
    last_emotion_scores = {}
    last_face_box = None
    frame_count = 0
    
    try:
        # Open camera
        print("Opening camera...")
        camera = cv2.VideoCapture(0)
        if not camera.isOpened():
            print("ERROR: Could not open camera")
            await websocket.send_json({"status": "error", "message": "Could not open camera"})
            return
        
        print("Camera opened successfully")
        # Set camera properties (matching working code)
        camera.set(cv2.CAP_PROP_FRAME_WIDTH, RESIZE_WIDTH)
        camera.set(cv2.CAP_PROP_FPS, 30)
        
        # Send initial connection message
        await websocket.send_json({"status": "connected", "message": "Camera initialized"})
        
        while True:
            # Read frame from webcam (OpenCV)
            ret, frame = camera.read()
            
            if not ret:
                print("Error: Could not read frame")
                await websocket.send_json({"status": "error", "message": "Failed to read frame"})
                break
            
            frame_height, frame_width = frame.shape[:2]
            
            # Only process every FRAME_SKIP frames for performance (matching working code)
            should_analyze = (frame_count % FRAME_SKIP == 0)
            frame_count += 1
            
            if should_analyze:
                # Convert to grayscale for OpenCV face detection
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                
                # Detect faces using OpenCV Haar Cascade
                faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
                
                if len(faces) > 0:
                    # Get the first detected face
                    x, y, w, h = faces[0]
                    
                    # Add padding around face
                    x = max(0, x - FACE_PADDING)
                    y = max(0, y - FACE_PADDING)
                    w = min(frame_width - x, w + 2 * FACE_PADDING)
                    h = min(frame_height - y, h + 2 * FACE_PADDING)
                    
                    last_face_box = (x, y, w, h)
                    
                    try:
                        # Crop face region for DeepFace emotion analysis
                        face_crop = frame[y:y+h, x:x+w]
                        
                        if face_crop.size > 0:
                            # Analyze emotion using DeepFace (skip face detection since we already have the face)
                            result = DeepFace.analyze(
                                img_path=face_crop,
                                actions=['emotion'],
                                enforce_detection=False,
                                detector_backend='skip',  # Skip detection - we already cropped the face
                                silent=True
                            )
                            
                            # Extract emotion data (matching working code)
                            if isinstance(result, list):
                                result = result[0]
                            
                            # Add current emotion scores to history
                            emotion_history.append(result['emotion'])
                            
                            # Calculate averaged emotion scores
                            if len(emotion_history) > 0:
                                avg_scores = {}
                                for emotion_name in emotion_history[0].keys():
                                    avg_scores[emotion_name] = np.mean([frame_emotions[emotion_name] for frame_emotions in emotion_history])
                                
                                # Get dominant emotion from averaged scores
                                last_emotion = max(avg_scores, key=avg_scores.get)
                                last_emotion_scores = avg_scores
                                
                                # Send emotion result
                                await websocket.send_json({
                                    "ts": int(time.time() * 1000),
                                    "status": "ok",
                                    "dominant": last_emotion,
                                    "confidence": round(avg_scores[last_emotion] / 100.0, 2),  # Convert percentage to 0-1
                                    "probs": {k: round(v / 100.0, 2) for k, v in avg_scores.items()},  # Convert to 0-1
                                })
                            else:
                                await websocket.send_json({
                                    "ts": int(time.time() * 1000),
                                    "status": "no_face"
                                })
                    except Exception as e:
                        print(f"DeepFace error: {e}")
                        # Keep showing last known emotion
                        pass
                else:
                    # No face detected by OpenCV
                    last_face_box = None
                    if not last_emotion_scores:
                        await websocket.send_json({
                            "ts": int(time.time() * 1000),
                            "status": "no_face"
                        })
            
            # Draw face rectangle using last known position (OpenCV)
            if last_face_box:
                x, y, w, h = last_face_box
                cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
            
            # Display smoothed dominant emotion (OpenCV) - matching working code
            if last_emotion_scores:
                cv2.putText(frame, f"Emotion: {last_emotion}", (10, 30), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                
                # Display averaged emotion scores
                y_offset = 70
                for emotion_name, score in last_emotion_scores.items():
                    text = f"{emotion_name}: {score:.1f}%"
                    cv2.putText(frame, text, (10, y_offset), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                    y_offset += 25
            elif not last_face_box:
                cv2.putText(frame, "No face detected", (10, 30), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            
            # Send frame as base64 encoded JPEG (send every frame for smooth video)
            try:
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                if buffer is not None and len(buffer) > 0:
                    frame_base64 = base64.b64encode(buffer).decode('utf-8')
                    
                    await websocket.send_json({
                        "type": "frame",
                        "frame": frame_base64,
                        "ts": int(time.time() * 1000)
                    })
            except Exception as e:
                print(f"Error encoding/sending frame: {e}")
            
            # Small delay to prevent CPU overload
            await asyncio.sleep(0.033)  # ~30 FPS
    
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
