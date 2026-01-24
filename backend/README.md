# Backend Setup

## Quick Start

1. Create virtual environment:
   ```bash
   python -m venv venv
   ```

2. Activate virtual environment:
   - Windows: `.\venv\Scripts\Activate.ps1`
   - macOS/Linux: `source venv/bin/activate`

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. (Optional) Create `.env` file:
   ```
   GEMINI_API_KEY=your_key_here
   DETECTOR_BACKEND=ssd
   ```

5. Run server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

## Endpoints

- `GET /ws/emotions` - WebSocket for emotion streaming
- `POST /api/transcribe` - Audio transcription (or text fallback)
- `POST /api/chat` - Conversation agent
- `POST /api/summarize` - Session summary generation
- `GET /health` - Health check
