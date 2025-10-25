# Always-On-Top Solutions for AssistMD

## The Problem
Chrome extensions cannot create windows that stay on top of the browser. Any content within the browser (sidepanel, injected overlays, popups) will fall behind when you click the main browser window.

## Working Solutions

### 1. **Picture-in-Picture (PiP) API** ✅
- **Pros**: True always-on-top, works cross-platform
- **Cons**: Limited UI (video only), requires creative canvas rendering
- **Implementation**: Render UI to canvas, stream to PiP video

### 2. **Native Companion App** ✅
- **Pros**: Full control, true always-on-top, rich UI
- **Cons**: Requires separate installation, platform-specific
- **Implementation**: Chrome Native Messaging API + Electron/Tauri app

### 3. **Browser Window Management** 🔄
- **Pros**: No extra installation, stays in browser
- **Cons**: Not true always-on-top, just window juggling
- **Implementation**: Track sidepanel window, auto-focus when needed

### 4. **OS-Level Solutions** 🛠️
- **macOS**: Use "Window > Float on Top" in third-party window managers
- **Windows**: Use PowerToys "Always on Top" (Win+Ctrl+T)
- **Linux**: Most window managers support always-on-top

## Recommended Approach

For immediate relief:
1. Use the existing sidepanel with better window tracking
2. Add keyboard shortcuts to quickly bring sidepanel to focus
3. Document OS-level always-on-top solutions for power users

For long-term solution:
1. Implement PiP mode for basic always-on-top transcription view
2. Consider native companion app for hospitals/clinics that need it

## Quick OS Workarounds

### macOS
1. Install Rectangle or Magnet (window managers)
2. Use their "Float on Top" feature for the Chrome sidepanel

### Windows  
1. Install PowerToys
2. Focus the sidepanel window
3. Press Win+Ctrl+T to make it always-on-top

### Linux (GNOME)
1. Right-click window title bar
2. Select "Always on Top"