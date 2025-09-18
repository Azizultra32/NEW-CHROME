# AGENTS.md — AssistMD Chrome Extension Orchestration (Codex-ready)

## Goal
Ship a production-ready MV3 Chrome extension with:
- Side Panel UI (React + Tailwind)
- Offscreen audio capture (VAD/chunk)
- WebSocket streaming to backend (Whisper adapter)
- Voice commands with TTS ducking
- Patient context guard + Smart Paste V2

## Golden Path (acceptance)
1) Click toolbar icon → Side Panel opens & is styled (no console errors)
2) Start Recording → mic permission → WS partials < 1 s
3) “assist insert plan” → action ≤ 500 ms; command audio not in transcript
4) Switch chart mid-session → Insert blocked → confirm → allowed → audit written
5) Smart Paste V2 → click-to-map + multi-strategy insert (textarea + contenteditable + iframe)

---

## PHASE 0 — Build & Static Audit

### MANIFEST-SURGEON
Mission: Ensure manifest.json references only dist/ assets and has required permissions/icons.
Commands:
- check_manifest_paths
- check_permissions
- check_icons

### PATH-VALIDATOR
Mission: Ensure HTML/CSS/JS references resolve correctly in dist.
Commands:
- scan_html_paths
- fix_sidepanel_css
- fix_script_injection

### DEP-SCANNER
Mission: Verify Tailwind/PostCSS/Autoprefixer and React/DOM are correctly wired.
Commands:
- verify_postcss_config
- verify_tailwind_config
- ensure_css_import_in_panel

---

## PHASE 1 — Panel & Runtime

### ACTION-TO-PANEL
Mission: Toolbar icon click opens Side Panel (or popup fallback).
Commands:
- test_action_click
- open_sidepanel

### REACT-RUNTIME-CHECKER
Mission: Side panel React app mounts and Tailwind CSS loads.
Commands:
- verify_root_mount
- verify_tailwind_load

---

## PHASE 2 — Recording & Offscreen

### OFFSCREEN-VALIDATOR
Mission: Offscreen document starts mic capture and chunking.
Commands:
- test_offscreen_create
- test_mic_permission
- test_chunk_flow

---

## PHASE 3 — WebSocket & ASR

### WS-PROBER
Mission: WebSocket handshake with backend; partial transcripts flow.
Commands:
- connect_ws
- send_hello
- verify_partial

---

## PHASE 4 — Voice & Patient Safety

### VOICE-COMMAND-AUDITOR
Mission: “assist …” commands; TTS ducking; exclude command audio from transcript.
Commands:
- test_command_latency
- test_tts_ducking
- test_transcript_exclusion

### PATIENT-GUARD-AUDITOR
Mission: Wrong-chart prevention with audit.
Commands:
- test_fingerprint
- test_boundary_marker
- test_pre_paste_verify

---

## PHASE 5 — Smart Paste V2

### PASTE-CHECKER
Mission: Click-to-map; verify-before-paste; multi-strategy insert; profiles import/export.
Commands:
- test_click_to_map
- test_multi_strategy_insert
- test_clipboard_preview
- test_profile_export_import

---

## Security/Config Guards (continuous)

### SECURITY-GUARD
Mission: Ensure no secrets in dist/ and client only has public config.
Commands:
- scan_dist_for_secrets
- assert_client_config_public
