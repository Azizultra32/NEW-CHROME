import { describe, it, expect, vi } from 'vitest';
import { enrichChunk, processDeepgramChunk } from '../src/deepgram.js';
import { SessionMetadata, StorageClient } from '../src/types.js';

class MemoryStorage implements StorageClient {
  public inserted: any[] = [];
  public patientContext: { visitId: string; patientId?: string; clinicianId?: string } = {
    visitId: 'v1',
    patientId: 'pat-1',
    clinicianId: 'clin-1'
  };
  constructor(private readonly failUntil = 0) {}
  private attempts = 0;
  async insertTranscriptChunk(chunk: any): Promise<void> {
    if (this.attempts < this.failUntil) {
      this.attempts += 1;
      throw new Error('db unavailable');
    }
    this.inserted.push(chunk);
  }
  async fetchTranscriptChunks(): Promise<any[]> {
    return [];
  }
  async fetchPatientContext() {
    return this.patientContext;
  }
  async persistGeneratedNote() {
    return { id: '1', version: 1, visitId: 'v1', content: '', type: 'summary' };
  }
  async health() {
    return { ok: true };
  }
}

describe('deepgram enrichment', () => {
  const baseSession: SessionMetadata = {
    sessionId: 's1',
    visitId: 'visit-123',
    clinicianId: 'clin-1',
    patientId: 'pat-1',
    consentRequired: true,
    consentGranted: false,
    speakerRoles: { '0': 'clinician', '1': 'patient' },
    alertOnUnknownSpeaker: true
  };

  it('maps diarized speaker to role and pulls identifiers', () => {
    const enriched = enrichChunk(
      { id: 'c1', transcript: 'hello', start: 0, end: 1, speaker: 1 },
      baseSession
    );
    expect(enriched.role).toBe('patient');
    expect(enriched.clinicianId).toBe('clin-1');
    expect(enriched.patientId).toBe('pat-1');
    expect(enriched.consentRequired).toBe(true);
    expect(enriched.consentGranted).toBe(false);
  });

  it('attaches alert when storage fails after retries', async () => {
    const storage = new MemoryStorage(3);
    const broadcast = vi.fn();
    const { enriched, persisted } = await processDeepgramChunk({
      chunk: { id: 'c1', transcript: 'test', start: 0, end: 1, speaker: 5 },
      session: baseSession,
      storage,
      retries: 1,
      broadcast
    });
    expect(persisted).toBe(false);
    expect(enriched.alerts).toContain('storage_failure');
    expect(broadcast).toHaveBeenCalledWith(enriched);
  });

  it('retries persistence before broadcasting', async () => {
    const storage = new MemoryStorage(1);
    const broadcast = vi.fn();
    const { persisted } = await processDeepgramChunk({
      chunk: { id: 'c2', transcript: 'retry', start: 1, end: 2, speaker: 0 },
      session: baseSession,
      storage,
      retries: 2,
      broadcast
    });
    expect(persisted).toBe(true);
    expect(storage.inserted).toHaveLength(1);
  });

  it('hydrates clinician and patient identifiers before sending to consent manager', async () => {
    const storage = new MemoryStorage();
    storage.patientContext = { visitId: 'v1', clinicianId: 'clin-storage', patientId: 'pat-storage' };
    const broadcast = vi.fn();
    const consentManager = { handleChunk: vi.fn() };
    const { enriched } = await processDeepgramChunk({
      chunk: { id: 'c3', transcript: 'with context', start: 2, end: 3, speaker: 1 },
      session: { ...baseSession, clinicianId: undefined, patientId: undefined },
      storage,
      broadcast,
      consentManager
    });
    expect(enriched.patientId).toBe('pat-storage');
    expect(enriched.clinicianId).toBe('clin-storage');
    expect(consentManager.handleChunk).toHaveBeenCalledWith(enriched);
  });
});
