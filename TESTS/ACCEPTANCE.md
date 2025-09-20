# Acceptance — Golden Path

## Panel loads
- Load unpacked (dist/)
- Click toolbar icon → panel opens (or popup fallback)
- Panel devtools: no 404/CSP; Tailwind styles visible

## Record & stream
- Start Recording → grant mic
- Speak 10–20s → WS frames (hello/ack/partial) visible
- Partial lines appear < 1 s

## Voice commands
- Say “assist insert plan” → action ≤ 500 ms
- Command audio NOT present in transcript

## Wrong-chart
- Start on Patient A → switch to B
- Insert → blocked; confirm → allowed; audit event (no PHI)

## Smart Paste V2
- Map HPI/Plan on dummy page; Insert succeeds
- contenteditable & same-origin iframe pass
