import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # Suppress TensorFlow logs
os.environ['TF_USE_LEGACY_KERAS'] = '1'  # Use tf-keras for compatibility

import time
import asyncio
from collections import deque
from typing import Dict, List

import cv2
import numpy as np
from deepface import DeepFace
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

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

# Initialize OpenCV Face Detection
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')


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
