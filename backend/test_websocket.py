import asyncio
import websockets
import json

async def test_websocket():
    uri = "ws://localhost:8000/ws/emotions"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to WebSocket!")
            print("Waiting for emotion data...")
            
            # Receive a few messages
            for i in range(5):
                message = await websocket.recv()
                data = json.loads(message)
                print(f"\nMessage {i+1}:")
                print(json.dumps(data, indent=2))
                
                if data.get("status") == "ok":
                    print(f"  [OK] Detected emotion: {data.get('dominant')} ({data.get('confidence', 0):.1f}% confidence)")
                elif data.get("status") == "no_face":
                    print("  [WARNING] No face detected")
                elif data.get("status") == "error":
                    print(f"  [ERROR] Error: {data.get('message')}")
                    
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_websocket())
