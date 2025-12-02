import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/server.js';
import { DomAutomationEngine } from '../src/dom-engine.js';
import { StorageClient, EnrichedChunk } from '../src/types.js';

class FakeStorage implements StorageClient {
  public chunks: EnrichedChunk[] = [];
  public notes: any[] = [];
  constructor(private readonly healthy = true) {}
  async insertTranscriptChunk(chunk: EnrichedChunk): Promise<void> {
    this.chunks.push(chunk);
  }
  async fetchTranscriptChunks(): Promise<EnrichedChunk[]> {
    return this.chunks;
  }
  async fetchPatientContext(visitId: string) {
    return { visitId, patientId: 'p1', clinicianId: 'c1' };
  }
  async persistGeneratedNote(params: any) {
    const version = this.notes.length + 1;
    const record = { id: `n${version}`, version, visitId: params.visitId, content: params.content, type: params.type };
    this.notes.push(record);
    return record;
  }
  async health() {
    return this.healthy ? { ok: true } : { ok: false, error: 'down' };
  }
}

describe('server', () => {
  it('reports health with injected probes', async () => {
    const storage = new FakeStorage(true);
    const app = createApp({
      storage,
      deepgramProbe: () => Promise.resolve({ ok: true, latencyMs: 10 })
    });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.deepgram.ok).toBe(true);
  });

  it('validates map request and returns mapping', async () => {
    const storage = new FakeStorage(true);
    const domEngine = new DomAutomationEngine();
    const app = createApp({ storage, domEngine });
    const res = await request(app)
      .post('/dom/map')
      .send({ url: 'https://ehr.test', fields: ['note', 'plan'], snapshotId: 'snap1' });
    expect(res.status).toBe(200);
    expect(res.body.mapped.note).toBeDefined();
  });

  it('rejects invalid fill payload', async () => {
    const app = createApp({ storage: new FakeStorage(true) });
    const res = await request(app).post('/actions/fill').send({});
    expect(res.status).toBe(400);
  });

  it('creates summary backed by storage data', async () => {
    const storage = new FakeStorage(true);
    storage.chunks.push({
      id: 'c1',
      start: 0,
      end: 1,
      transcript: 'patient has headache',
      role: 'patient',
      alerts: [],
      consentRequired: true,
      consentGranted: true,
      sessionId: 's1',
      visitId: 'v1'
    });
    const app = createApp({ storage });
    const res = await request(app).post('/assist/summary').send({ visitId: 'v1', generatedBy: 'tester' });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(storage.notes).toHaveLength(1);
  });
});
