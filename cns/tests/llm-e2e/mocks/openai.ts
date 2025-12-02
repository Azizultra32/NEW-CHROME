import { vi } from 'vitest';

export function createMockOpenAIClient() {
  return {
    transcribe: vi.fn(async (chunks) => {
      return chunks.map((chunk) => ({ id: chunk.id, role: chunk.role, text: chunk.transcript }));
    }),
    summarize: vi.fn(async (transcript) => ({
      note: `SUMMARY:${transcript.length}`,
      consent: transcript.every((c) => c.consentGranted !== false)
    }))
  };
}
