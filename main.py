import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # Suppress TensorFlow logs
os.environ['TF_USE_LEGACY_KERAS'] = '1'  # Use tf-keras for compatibility

import cv2
from deepface import DeepFace
from collections import deque
import numpy as np

# ========== CONFIGURATION ==========
SMOOTHING_WINDOW = 5        # Number of frames to average emotions over
FRAME_SKIP = 3              # Process every Nth frame (higher = faster but less responsive)
RESIZE_WIDTH = 640          # Resize frame for faster processing
FACE_PADDING = 30           # Pixels to add around detected face
# ===================================

# Initialize OpenCV Face Detection (Haar Cascade)
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

# Initialize webcam
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, RESIZE_WIDTH)
cap.set(cv2.CAP_PROP_FPS, 30)

# Check if webcam is opened successfully
if not cap.isOpened():
    print("Error: Could not access webcam")
    exit()

print("Press 'q' to quit")
print("Loading emotion detection model...")

# Emotion averaging system
emotion_history = deque(maxlen=SMOOTHING_WINDOW)
last_emotion = "neutral"
last_emotion_scores = {}
last_face_box = None

frame_count = 0

while True:
    # Read frame from webcam (OpenCV)
    ret, frame = cap.read()
    
    if not ret:
        print("Error: Could not read frame")
        break
    
    frame_height, frame_width = frame.shape[:2]
    
    # Only process every FRAME_SKIP frames for performance
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
                    
                    # Extract emotion data
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
                        
            except Exception as e:
                pass  # Keep showing last known emotion
        else:
            # No face detected by OpenCV
            if not last_emotion_scores:
                cv2.putText(frame, "No face detected", (10, 30), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
    
    # Draw face rectangle using last known position (OpenCV)
    if last_face_box:
        x, y, w, h = last_face_box
        cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
    
    # Display smoothed dominant emotion (OpenCV)
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
    
    # Display the frame (OpenCV)
    cv2.imshow('Emotion Detection - Press q to quit', frame)
    
    # Break loop on 'q' key press
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Release resources
cap.release()
cv2.destroyAllWindows()
