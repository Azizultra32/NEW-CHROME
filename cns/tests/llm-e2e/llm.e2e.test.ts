import { describe, it, expect } from 'vitest';
import { hydrateTranscript, buildWsHelper } from './helpers.js';
import { createMockDeepgramClient } from './mocks/deepgram.js';
import { createMockOpenAIClient } from './mocks/openai.js';

describe('LLM Phase 7 E2E harness', () => {
  it('loads diarized fixtures and labels consent state', async () => {
    const chunks = hydrateTranscript();
    expect(chunks[0].role).toBe('clinician');
    expect(chunks[1].role).toBe('patient');
    expect(chunks.some((c) => c.alerts.includes('consent_pending'))).toBe(true);
  });

  it('pipes hydrated chunks through mock clients and websocket helper', async () => {
    const deepgram = createMockDeepgramClient();
    const openai = createMockOpenAIClient();
    const hydrated = hydrateTranscript({ consentGranted: true });
    const ws = buildWsHelper(hydrated);

    const streamed = await deepgram.streamTranscript();
    const enrichedTranscript = streamed.map((chunk, idx) => ({ ...hydrated[idx], transcript: chunk.transcript }));
    const transcription = await openai.transcribe(enrichedTranscript);
    const summary = await openai.summarize(enrichedTranscript);
    await Promise.all(enrichedTranscript.map((chunk) => ws.send(chunk)));

    expect(transcription).toHaveLength(2);
    expect(summary.consent).toBe(true);
    expect(ws.sent).toHaveLength(2);
    expect(ws.replay()).toContain('consent granted');
  });
});
