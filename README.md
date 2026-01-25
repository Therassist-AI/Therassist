# Therassist

A therapy screening application that uses real-time emotion detection and speech-to-text transcription to help therapists analyze patient sessions. The application captures facial emotions during therapy questions, transcribes audio responses, and generates AI-powered clinical reports.

## Tech Stack

### Backend
- **Python 3.11+** - Core programming language
- **FastAPI** - Modern, fast web framework for building APIs
- **Uvicorn** - ASGI server for running FastAPI
- **DeepFace** - Deep learning-based emotion detection
- **TensorFlow/Keras** - Machine learning framework (via tf-keras)
- **OpenCV** - Computer vision library for face detection
- **OpenAI Whisper** - Local speech-to-text transcription
- **OpenAI API Client** - For LLM-based report generation via TELUS Sovereign AI Factory
- **WebSocket** - Real-time bidirectional communication
- **Python-dotenv** - Environment variable management

### Frontend
- **Next.js 16** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS 4** - Utility-first CSS framework

### System Dependencies
- **FFmpeg** - Required for audio processing with Whisper
  - macOS: `brew install ffmpeg`
  - Windows: `choco install ffmpeg` or download from [ffmpeg.org](https://ffmpeg.org/download.html)
  - Linux: `sudo apt install ffmpeg`

## Prerequisites

- Python 3.11 or higher
- Node.js 18+ and npm
- FFmpeg installed on your system
- Webcam access
- Microphone access

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Therassist
```

### 2. Backend Setup

1. Create a Python virtual environment:

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

2. Install Python dependencies:

```bash
pip install -r requirements.txt
```

3. Create a `.env` file in the root directory:

```bash
# LLM Configuration (for report generation via TELUS Sovereign AI Factory)
LLM_BASE_URL=your_telus_sovereign_ai_factory_api_url
LLM_API_KEY=your_telus_api_key
LLM_MODEL=your_model_name
```

**Note:** The application uses LLM models hosted on the **TELUS Sovereign AI Factory** for generating therapy reports. The TELUS Sovereign AI Factory provides a secure, sovereign AI infrastructure for healthcare applications, ensuring data privacy and compliance with healthcare regulations.

### 3. Frontend Setup

1. Navigate to the frontend directory:

```bash
cd frontend
```

2. Install dependencies:

```bash
npm install
```

## Running the Application

### Start the Backend Server

1. Activate your virtual environment (if not already activated):

```bash
# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

2. Navigate to the backend directory:

```bash
cd backend
```

3. Start the FastAPI server:

```bash
python main.py
```

Or using uvicorn directly:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The backend API will be available at `http://localhost:8000`

### Start the Frontend Development Server

1. Open a new terminal window
2. Navigate to the frontend directory:

```bash
cd frontend
```

3. Start the Next.js development server:

```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`

## Usage

1. **Start a Session**: Open `http://localhost:3000` in your browser
2. **Grant Permissions**: Allow camera and microphone access when prompted
3. **Begin Therapy Session**: The application will:
   - Display therapy questions one at a time
   - Track your facial emotions in real-time via webcam
   - Record your audio responses
   - Process and transcribe your responses
   - Generate a clinical report with emotion analysis

4. **View Results**: After completing all questions, you can view:
   - Session transcript
   - Emotion analysis summary
   - AI-generated clinical report

## Project Structure

```
Therassist/
├── backend/
│   └── main.py              # FastAPI backend server
├── frontend/
│   ├── app/                 # Next.js app directory
│   │   ├── page.tsx         # Main application page
│   │   ├── layout.tsx       # Root layout
│   │   └── globals.css      # Global styles
│   ├── hooks/               # React custom hooks
│   │   ├── useAudioRecorder.ts
│   │   ├── useSessionWebSocket.ts
│   │   └── useWebSocket.ts
│   └── package.json
├── sessions/                # Generated session data (created at runtime)
├── main.py                  # Standalone emotion detection script
├── requirements.txt         # Python dependencies
└── README.md
```

## API Endpoints

- `GET /api/questions` - Get list of therapy questions
- `POST /api/session/start` - Start a new therapy session
- `POST /api/session/{session_id}/audio/{question_number}` - Upload audio for a question
- `POST /api/session/{session_id}/emotions/{question_number}` - Save emotion data
- `POST /api/session/{session_id}/transcribe` - Transcribe all audio and generate report
- `GET /api/session/{session_id}/summary` - Get session summary
- `WebSocket /ws/emotions/{session_id}` - Real-time emotion streaming
- `GET /health` - Health check endpoint

## Features

- **Real-time Emotion Detection**: Uses DeepFace to analyze facial expressions during therapy sessions
- **Speech-to-Text**: Local Whisper transcription for privacy
- **Session Management**: Tracks emotions and audio per question
- **AI-Powered Reports**: Generates clinical summaries using LLM analysis via TELUS Sovereign AI Factory
- **WebSocket Communication**: Real-time emotion streaming to frontend
- **Privacy-Focused**: Local processing for emotion detection and transcription

## Troubleshooting

### Camera Not Working
- Ensure your webcam is connected and not being used by another application
- Check browser permissions for camera access
- On Windows, you may need to grant camera permissions in system settings

### Audio Transcription Fails
- Verify FFmpeg is installed: `ffmpeg -version`
- Check that audio files are being recorded correctly
- Ensure microphone permissions are granted

### LLM Report Generation Fails
- Verify your `.env` file has correct `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`
- Check that your API endpoint is accessible
- Review backend logs for specific error messages

### Import Errors
- Ensure all Python dependencies are installed: `pip install -r requirements.txt`
- Verify you're using the correct Python version (3.11+)
- Try reinstalling problematic packages: `pip install --upgrade <package-name>`

## Development

### Backend Development
- The backend uses FastAPI with automatic API documentation
- Visit `http://localhost:8000/docs` for interactive API documentation
- Session data is stored in the `sessions/` directory

### Frontend Development
- Uses Next.js 16 with App Router
- TypeScript for type safety
- Tailwind CSS for styling
- Custom React hooks for WebSocket and audio recording




