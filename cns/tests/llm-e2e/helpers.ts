import { DeepgramChunk, EnrichedChunk } from '../../src/types.js';
import { enrichChunk } from '../../src/deepgram.js';
import { loadFixtureTranscript } from './mocks/deepgram.js';

export function hydrateTranscript(sessionOverrides: Partial<EnrichedChunk> = {}): EnrichedChunk[] {
  const session = {
    sessionId: 'llm-session',
    visitId: 'visit-llm',
    clinicianId: 'clin-llm',
    patientId: 'pat-llm',
    consentGranted: false,
    consentRequired: true,
    speakerRoles: { '0': 'clinician', '1': 'patient' },
    alertOnUnknownSpeaker: true,
    ...sessionOverrides
  } as any;
  return loadFixtureTranscript().map((chunk: DeepgramChunk) => enrichChunk(chunk, session));
}

export function buildWsHelper(chunks: EnrichedChunk[]) {
  return {
    sent: [] as EnrichedChunk[],
    send(chunk: EnrichedChunk) {
      this.sent.push(chunk);
      return Promise.resolve();
    },
    replay() {
      return chunks.map((c) => c.transcript).join('\n');
    }
  };
}
