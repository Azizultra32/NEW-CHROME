# Task Execution Plan

## Goal
Deliver a production-ready AssistMD MV3 Chrome extension that satisfies the Golden Path acceptance criteria.

## Approach
Work iteratively from manifest validation through Smart Paste V2, validating each milestone against the Golden Path and security guards.

## Phases & Tasks
1. **Manifest Surgeon & Path Validation**
   - Run `check_manifest_paths`, `check_permissions`, and `check_icons`.
   - Run `scan_html_paths`, `fix_sidepanel_css`, and `fix_script_injection` to ensure dist references resolve.
2. **Dependency & Styling Verification**
   - Execute `verify_postcss_config`, `verify_tailwind_config`, and `ensure_css_import_in_panel`.
3. **Panel & Runtime Bring-up**
   - Use `test_action_click` and `open_sidepanel` to confirm toolbar → side panel behavior.
   - Validate React mount and Tailwind load via `verify_root_mount` and `verify_tailwind_load`.
4. **Recording & Offscreen Audio**
   - Confirm offscreen creation and mic flow with `test_offscreen_create`, `test_mic_permission`, and `test_chunk_flow`.
5. **WebSocket & ASR Streaming**
   - Probe handshake and partial transcripts using `connect_ws`, `send_hello`, and `verify_partial`.
6. **Voice Commands & Patient Safety**
   - Audit TTS ducking and transcript exclusion via `test_command_latency`, `test_tts_ducking`, and `test_transcript_exclusion`.
   - Validate patient guard rails with `test_fingerprint`, `test_boundary_marker`, and `test_pre_paste_verify`.
7. **Smart Paste V2**
   - Run `test_click_to_map`, `test_multi_strategy_insert`, `test_clipboard_preview`, and `test_profile_export_import`.
8. **Security & Compliance**
   - Continuously enforce `scan_dist_for_secrets` and `assert_client_config_public`.

## Execution Notes
- Prioritize readable, well-instrumented code with meaningful comments for complex logic.
- Add error handling around I/O, WebSocket, and permission flows; avoid try/catch on imports.
- Prefer incremental commits per phase and run targeted tests aligned with touched components.
- Surface refactoring opportunities when patterns repeat across side panel, offscreen, and backend adapters.
- Recommend test cases for new code paths and alert if documentation updates require code changes.
