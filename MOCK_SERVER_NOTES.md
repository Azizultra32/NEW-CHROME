# Mock Server Notes

## Known Issue: Duplicate WebSocket Connections

Chrome extensions can create multiple WebSocket connections when:
1. The offscreen document connects
2. The background service worker also tries to connect
3. The extension reloads partially

## Solution Implemented

The mock server now **only sends messages to the FIRST connection** (id: 1).
- Primary connection (id: 1) receives all mock partials
- Secondary connections receive an info message explaining they're blocked
- This prevents duplicate messages in the UI

## If You Still See Duplicates

1. **Kill all processes**: `pkill -f "node server.js"`
2. **Restart fresh**: `node server.js`
3. **Reload extension completely** in Chrome
4. **Check server logs** to see connection patterns

## Alternative: Run Without Mock Server

The extension works fine without the mock server:
- Voice commands still work via Web Speech API
- No duplicate message issues
- Shows "[MOCK] ...listening" in the UI

## The Mock Server's Purpose

- Simulates a real ASR (Automatic Speech Recognition) WebSocket service
- Useful for testing streaming transcription without a real ASR backend
- Not required for basic voice command testing