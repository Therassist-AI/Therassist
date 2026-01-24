# Therassist

An opt-in guided check-in tool that provides real-time emotion signals and supportive conversation prompts. Built for hackathon prototyping with privacy-first design.

## Features

- **Real-time Emotion Analysis**: Streams emotion signals from webcam using OpenCV + DeepFace (processed locally, no raw frames sent)
- **Voice & Text Input**: Push-to-talk audio recording with transcription fallback, or type directly
- **Conversation Agent**: Supportive reflection prompts using LLM (Gemini) or deterministic fallbacks
- **Session Summary**: Therapist-ready structured summaries with editable text export
- **Privacy-First**: No raw video/audio stored, all processing local, user controls all sharing

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend**: Python 3.10+ FastAPI
- **Vision**: OpenCV + DeepFace
- **LLM**: Google Gemini (optional, with fallbacks)

## Prerequisites

- Python 3.10 or higher
- Node.js 18+ and npm
- Webcam (optional, for emotion signals)
- Microphone (optional, for voice input)

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   ```

3. Activate the virtual environment:
   - **Windows (PowerShell)**:
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
   - **Windows (CMD)**:
     ```cmd
     venv\Scripts\activate.bat
     ```
   - **macOS/Linux**:
     ```bash
     source venv/bin/activate
     ```

4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

5. (Optional) Create a `.env` file for API keys:
   ```bash
   # Copy the example file
   # On Windows, you may need to create this manually
   ```
   
   Add to `.env`:
   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   DETECTOR_BACKEND=ssd
   ```
   
   **Note**: The app works without API keys! You can use typed text input and get stub responses.

6. Run the backend server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

   The API will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev -- -p 3000
   ```

   The app will be available at `http://localhost:3000`

## Usage

1. **Start both servers** (backend on port 8000, frontend on port 3000)

2. **Open the app** in your browser: `http://localhost:3000`

3. **Consent Screen**:
   - Review the privacy notice and disclaimers
   - Toggle camera and microphone as desired
   - Check the consent checkbox
   - Click "Start Session"

4. **Session Page**:
   - **Left Panel (Conversation)**:
     - Type messages or use push-to-talk (if mic enabled)
     - Receive supportive responses from the conversation agent
     - Click "End Session" when done
   - **Right Panel (Emotion Signals)**:
     - View real-time emotion analysis (if camera enabled)
     - See dominant emotion and confidence
     - View emotion timeline chart

5. **Review Page**:
   - Review the generated summary
   - Edit the summary text as needed
   - Copy to clipboard or download as .txt file

## Troubleshooting

### Webcam Permissions

- **Windows**: Check Settings > Privacy > Camera
- **macOS**: System Preferences > Security & Privacy > Camera
- **Linux**: May need to grant permissions via browser settings

If the camera doesn't work:
- Ensure no other application is using the camera
- Try restarting the backend server
- Check browser console for WebSocket connection errors

### DeepFace Detector Backend

The default detector is `ssd`. You can change it in `.env`:
- `ssd` (default, faster)
- `opencv` (more compatible)
- `mtcnn` (more accurate, slower)
- `retinaface` (most accurate, slowest)

If you get detection errors, try switching to `opencv`:
```
DETECTOR_BACKEND=opencv
```

### Windows Long Path Issues

If you encounter "path too long" errors during pip install:
1. Enable Windows Long Path support (requires admin):
   - Open PowerShell as Administrator
   - Run: `New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force`
   - Restart your computer
2. Or use a shorter path for your project

### Microphone Not Working

- Check browser permissions for microphone access
- Ensure no other application is using the microphone
- Use the text input fallback if needed

### API Connection Errors

- Ensure backend is running on port 8000
- Check CORS settings in `backend/main.py` if accessing from a different origin
- Verify no firewall is blocking localhost connections

### No LLM Responses

The app works without API keys! If `GEMINI_API_KEY` is not set:
- You'll get deterministic stub responses
- Transcription will prompt for typed text
- Summary will use simple extraction

To enable full LLM features:
1. Get a Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Add it to `backend/.env` as `GEMINI_API_KEY=your_key_here`
3. Restart the backend server

## Project Structure

```
therassist/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── requirements.txt     # Python dependencies
│   └── .env                 # Environment variables (create this)
├── frontend/
│   ├── app/                 # Next.js app router pages
│   │   ├── page.tsx         # Consent screen
│   │   ├── session/[id]/    # Session pages
│   │   └── layout.tsx       # Root layout
│   ├── components/          # React components
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utilities and store
│   └── package.json         # Node dependencies
└── README.md
```

## Privacy & Security

- **No raw video/audio stored**: Only processed emotion signals and transcripts
- **Local processing**: DeepFace runs on your machine, not in the cloud
- **User-controlled sharing**: All export is manual, nothing sent automatically
- **No medical advice**: This is a prototype tool, not a replacement for professional care

## Development Notes

- Emotion analysis runs at 2 FPS max (500ms intervals)
- Frames are resized to 50% for performance
- 5-second sliding window for emotion smoothing
- WebSocket automatically releases camera on disconnect
- All state managed in browser memory (Zustand store)

## License

This is a hackathon prototype. Use at your own discretion.

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review browser console and backend logs
3. Ensure all dependencies are installed correctly
