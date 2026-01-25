import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # Suppress TensorFlow logs
os.environ['TF_USE_LEGACY_KERAS'] = '1'  # Use tf-keras for compatibility

import time
import json
import asyncio
import uuid
from pathlib import Path
from collections import deque
from typing import Dict, List, Optional

import cv2
import numpy as np
from deepface import DeepFace
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(title="Therassist API")

# CORS configuration for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
SMOOTHING_WINDOW = 5
FRAME_SKIP = 3
FACE_PADDING = 30
SESSIONS_DIR = Path("sessions")
SESSIONS_DIR.mkdir(exist_ok=True)

# Pre-set therapy questions
THERAPY_QUESTIONS = [
    "How are you feeling today? Take a moment to describe your current emotional state.",
    "What has been on your mind lately? Share any thoughts or worries you've been carrying.",
    "Can you describe a recent challenge or difficulty you've faced?",
    "What are you grateful for right now? Name a few things that bring you joy.",
    "What would help you feel better or more at peace? What support do you need?"
]

# Initialize OpenCV Face Detection
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

# Active sessions storage (in-memory for MVP)
active_sessions: Dict[str, Dict] = {}


def calculate_top_emotions(emotion_history: List[Dict], top_n: int = 2) -> List[Dict]:
    """Calculate top N most frequent emotions from session history."""
    if not emotion_history:
        return []
    
    # Count dominant emotions
    emotion_counts = {}
    for record in emotion_history:
        dominant = record.get("dominant")
        if dominant:
            emotion_counts[dominant] = emotion_counts.get(dominant, 0) + 1
    
    # Sort by count and get top N
    sorted_emotions = sorted(emotion_counts.items(), key=lambda x: x[1], reverse=True)
    total = len(emotion_history)
    
    return [
        {"emotion": emotion, "count": count, "percentage": round(count / total * 100, 1)}
        for emotion, count in sorted_emotions[:top_n]
    ]


@app.get("/api/questions")
async def get_questions():
    """Get the list of therapy questions."""
    return {"questions": THERAPY_QUESTIONS}


@app.post("/api/session/start")
async def start_session():
    """Start a new therapy session and return session ID."""
    session_id = str(uuid.uuid4())[:8]
    session_dir = SESSIONS_DIR / session_id
    session_dir.mkdir(exist_ok=True)
    
    active_sessions[session_id] = {
        "created_at": time.time(),
        "current_question": 0,
        "emotions": {i: [] for i in range(len(THERAPY_QUESTIONS))},
        "audio_files": []
    }
    
    return {"session_id": session_id, "total_questions": len(THERAPY_QUESTIONS)}


@app.post("/api/session/{session_id}/audio/{question_number}")
async def save_audio(
    session_id: str,
    question_number: int,
    audio: UploadFile = File(...)
):
    """Save audio recording for a specific question."""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if question_number < 0 or question_number >= len(THERAPY_QUESTIONS):
        raise HTTPException(status_code=400, detail="Invalid question number")
    
    session_dir = SESSIONS_DIR / session_id
    
    # Determine file extension from content type
    ext = "webm"  # Default for browser MediaRecorder
    if audio.content_type:
        if "mp3" in audio.content_type:
            ext = "mp3"
        elif "wav" in audio.content_type:
            ext = "wav"
        elif "ogg" in audio.content_type:
            ext = "ogg"
    
    audio_path = session_dir / f"q{question_number}.{ext}"
    
    # Save audio file
    content = await audio.read()
    with open(audio_path, "wb") as f:
        f.write(content)
    
    active_sessions[session_id]["audio_files"].append(str(audio_path))
    
    return {"status": "saved", "path": str(audio_path), "size": len(content)}


@app.post("/api/session/{session_id}/emotions/{question_number}")
async def save_emotions(
    session_id: str,
    question_number: int,
    emotions: List[Dict]
):
    """Save emotion data for a specific question."""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if question_number < 0 or question_number >= len(THERAPY_QUESTIONS):
        raise HTTPException(status_code=400, detail="Invalid question number")
    
    session_dir = SESSIONS_DIR / session_id
    
    # Save emotions to JSON file
    emotions_path = session_dir / f"q{question_number}_emotions.json"
    with open(emotions_path, "w") as f:
        json.dump({
            "question_number": question_number,
            "question": THERAPY_QUESTIONS[question_number],
            "emotions": emotions,
            "top_emotions": calculate_top_emotions(emotions)
        }, f, indent=2)
    
    # Also store in memory
    active_sessions[session_id]["emotions"][question_number] = emotions
    
    return {"status": "saved", "count": len(emotions)}


@app.post("/api/session/{session_id}/transcribe")
async def transcribe_session(session_id: str):
    """Transcribe all audio files using local Whisper and create combined transcript."""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_dir = SESSIONS_DIR / session_id
    
    # Import Whisper (lazy load to avoid slow startup)
    try:
        import whisper
    except ImportError:
        raise HTTPException(status_code=500, detail="openai-whisper package not installed. Run: pip install openai-whisper")
    
    # Fix SSL certificate issues on macOS
    import ssl
    import certifi
    ssl._create_default_https_context = lambda: ssl.create_default_context(cafile=certifi.where())
    
    # Load Whisper model (uses cached model after first download)
    try:
        model = whisper.load_model("base")  # Options: tiny, base, small, medium, large
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load Whisper model: {str(e)}. Ensure ffmpeg is installed.")
    
    transcripts = []
    
    # Find and transcribe all audio files
    for q_num in range(len(THERAPY_QUESTIONS)):
        # Look for audio file (could be webm, mp3, wav, ogg)
        audio_file = None
        for ext in ["webm", "mp3", "wav", "ogg"]:
            potential_path = session_dir / f"q{q_num}.{ext}"
            if potential_path.exists():
                audio_file = potential_path
                break
        
        if audio_file:
            try:
                # Transcribe with Whisper locally
                result = model.transcribe(str(audio_file))
                transcript_text = result["text"].strip()
                
                transcripts.append({
                    "question_number": q_num + 1,
                    "question": THERAPY_QUESTIONS[q_num],
                    "transcript": transcript_text
                })
                
            except Exception as e:
                transcripts.append({
                    "question_number": q_num + 1,
                    "question": THERAPY_QUESTIONS[q_num],
                    "transcript": f"[Transcription failed: {str(e)}]"
                })
        else:
            transcripts.append({
                "question_number": q_num + 1,
                "question": THERAPY_QUESTIONS[q_num],
                "transcript": "[No audio recorded]"
            })
    
    # Create combined transcript file
    combined_text = "THERASSIST SESSION TRANSCRIPT\n"
    combined_text += f"Session ID: {session_id}\n"
    combined_text += f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
    combined_text += "=" * 50 + "\n\n"
    
    for t in transcripts:
        combined_text += f"QUESTION {t['question_number']}: {t['question']}\n"
        combined_text += "-" * 40 + "\n"
        combined_text += f"{t['transcript']}\n\n"
    
    # Save transcript file
    transcript_path = session_dir / "transcript.txt"
    with open(transcript_path, "w") as f:
        f.write(combined_text)
    
    return {
        "status": "completed",
        "transcripts": transcripts,
        "combined_transcript": combined_text,
        "transcript_path": str(transcript_path)
    }


@app.get("/api/session/{session_id}/summary")
async def get_session_summary(session_id: str):
    """Get summary of the session including all emotions."""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = active_sessions[session_id]
    
    # Combine all emotions across questions
    all_emotions = []
    per_question_summary = []
    
    for q_num in range(len(THERAPY_QUESTIONS)):
        q_emotions = session["emotions"].get(q_num, [])
        all_emotions.extend(q_emotions)
        per_question_summary.append({
            "question_number": q_num + 1,
            "question": THERAPY_QUESTIONS[q_num],
            "emotion_count": len(q_emotions),
            "top_emotions": calculate_top_emotions(q_emotions)
        })
    
    return {
        "session_id": session_id,
        "total_readings": len(all_emotions),
        "overall_top_emotions": calculate_top_emotions(all_emotions),
        "per_question": per_question_summary
    }


@app.websocket("/ws/emotions/{session_id}")
async def websocket_emotions_session(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time emotion streaming during a session."""
    await websocket.accept()
    
    camera = None
    emotion_window = deque(maxlen=SMOOTHING_WINDOW)
    current_question_emotions = []
    current_question = 0
    frame_count = 0
    
    try:
        # Open camera
        camera = cv2.VideoCapture(0)
        if not camera.isOpened():
            await websocket.send_json({"status": "error", "message": "Could not open camera"})
            return
        
        await websocket.send_json({"status": "started", "message": "Emotion tracking started"})
        
        while True:
            # Check for incoming messages (question changes, stop)
            try:
                message = await asyncio.wait_for(websocket.receive_json(), timeout=0.01)
                
                if message.get("action") == "next_question":
                    # Save current question emotions
                    if session_id in active_sessions:
                        active_sessions[session_id]["emotions"][current_question] = current_question_emotions.copy()
                    
                    # Reset for next question
                    current_question = message.get("question_number", current_question + 1)
                    current_question_emotions = []
                    emotion_window.clear()
                    
                    await websocket.send_json({
                        "status": "question_changed",
                        "question_number": current_question
                    })
                    
                elif message.get("action") == "stop":
                    # Save final question emotions
                    if session_id in active_sessions:
                        active_sessions[session_id]["emotions"][current_question] = current_question_emotions.copy()
                    break
                    
            except asyncio.TimeoutError:
                pass  # No message, continue with emotion processing
            
            ret, frame = camera.read()
            if not ret:
                continue
            
            frame_count += 1
            
            if frame_count % FRAME_SKIP != 0:
                await asyncio.sleep(0.03)
                continue
            
            frame_height, frame_width = frame.shape[:2]
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
            
            if len(faces) > 0:
                x, y, w, h = faces[0]
                x = max(0, x - FACE_PADDING)
                y = max(0, y - FACE_PADDING)
                w = min(frame_width - x, w + 2 * FACE_PADDING)
                h = min(frame_height - y, h + 2 * FACE_PADDING)
                
                try:
                    face_crop = frame[y:y+h, x:x+w]
                    
                    if face_crop.size > 0:
                        result = DeepFace.analyze(
                            img_path=face_crop,
                            actions=['emotion'],
                            enforce_detection=False,
                            detector_backend='skip',
                            silent=True
                        )
                        
                        if isinstance(result, list):
                            result = result[0]
                        
                        emotions = result.get('emotion', {})
                        emotion_window.append(emotions)
                        
                        if emotion_window:
                            avg_probs = {}
                            for emotion_name in emotions.keys():
                                avg_probs[emotion_name] = np.mean([e.get(emotion_name, 0) for e in emotion_window])
                            
                            dominant = max(avg_probs.items(), key=lambda x: x[1])[0]
                            confidence = avg_probs[dominant]
                            
                            record = {
                                "ts": int(time.time() * 1000),
                                "dominant": dominant,
                                "confidence": round(confidence, 2),
                                "probs": {k: round(v, 2) for k, v in avg_probs.items()}
                            }
                            current_question_emotions.append(record)
                            
                            await websocket.send_json({
                                "status": "emotion",
                                "question_number": current_question,
                                **record
                            })
                
                except Exception:
                    pass
            
            else:
                await websocket.send_json({
                    "status": "no_face",
                    "ts": int(time.time() * 1000)
                })
            
            await asyncio.sleep(0.1)
    
    except WebSocketDisconnect:
        # Save final emotions on disconnect
        if session_id in active_sessions:
            active_sessions[session_id]["emotions"][current_question] = current_question_emotions.copy()
        print(f"Client disconnected from session {session_id}")
    
    except Exception as e:
        print(f"WebSocket error: {e}")
    
    finally:
        if camera is not None:
            camera.release()
            print("Camera released")


@app.websocket("/ws/emotions")
async def websocket_emotions(websocket: WebSocket):
    """WebSocket endpoint for real-time emotion streaming."""
    await websocket.accept()
    
    camera = None
    emotion_window = deque(maxlen=SMOOTHING_WINDOW)
    session_history = []  # Store all emotions for session summary
    frame_count = 0
    
    try:
        # Open camera
        camera = cv2.VideoCapture(0)
        if not camera.isOpened():
            await websocket.send_json({"status": "error", "message": "Could not open camera"})
            return
        
        await websocket.send_json({"status": "started", "message": "Session started"})
        
        while True:
            ret, frame = camera.read()
            if not ret:
                await websocket.send_json({"status": "error", "message": "Failed to read frame"})
                break
            
            frame_count += 1
            
            # Only process every FRAME_SKIP frames
            if frame_count % FRAME_SKIP != 0:
                await asyncio.sleep(0.03)  # ~30fps pacing
                continue
            
            frame_height, frame_width = frame.shape[:2]
            
            # Convert to grayscale for face detection
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            # Detect faces using OpenCV Haar Cascade
            faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
            
            if len(faces) > 0:
                x, y, w, h = faces[0]
                
                # Add padding
                x = max(0, x - FACE_PADDING)
                y = max(0, y - FACE_PADDING)
                w = min(frame_width - x, w + 2 * FACE_PADDING)
                h = min(frame_height - y, h + 2 * FACE_PADDING)
                
                try:
                    face_crop = frame[y:y+h, x:x+w]
                    
                    if face_crop.size > 0:
                        result = DeepFace.analyze(
                            img_path=face_crop,
                            actions=['emotion'],
                            enforce_detection=False,
                            detector_backend='skip',
                            silent=True
                        )
                        
                        if isinstance(result, list):
                            result = result[0]
                        
                        emotions = result.get('emotion', {})
                        emotion_window.append(emotions)
                        
                        # Calculate smoothed emotions
                        if emotion_window:
                            avg_probs = {}
                            for emotion_name in emotions.keys():
                                avg_probs[emotion_name] = np.mean([e.get(emotion_name, 0) for e in emotion_window])
                            
                            dominant = max(avg_probs.items(), key=lambda x: x[1])[0]
                            confidence = avg_probs[dominant]
                            
                            # Store for session summary
                            record = {
                                "ts": int(time.time() * 1000),
                                "dominant": dominant,
                                "confidence": round(confidence, 2),
                                "probs": {k: round(v, 2) for k, v in avg_probs.items()}
                            }
                            session_history.append(record)
                            
                            # Send to client
                            await websocket.send_json({
                                "status": "emotion",
                                **record
                            })
                
                except Exception as e:
                    pass  # Continue on analysis errors
            
            else:
                await websocket.send_json({
                    "status": "no_face",
                    "ts": int(time.time() * 1000)
                })
            
            await asyncio.sleep(0.1)  # 10fps for WebSocket updates
    
    except WebSocketDisconnect:
        print("Client disconnected")
    
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"status": "error", "message": str(e)})
        except:
            pass
    
    finally:
        # Calculate and send session summary
        if session_history:
            top_emotions = calculate_top_emotions(session_history)
            try:
                await websocket.send_json({
                    "status": "session_end",
                    "top_emotions": top_emotions,
                    "total_readings": len(session_history)
                })
            except:
                pass
        
        # Release camera
        if camera is not None:
            camera.release()
            print("Camera released")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
