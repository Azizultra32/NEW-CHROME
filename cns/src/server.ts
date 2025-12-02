import express from 'express';
import fetch from 'node-fetch';
import { z } from 'zod';
import { AssistService } from './assist-service.js';
import { DomAutomationEngine } from './dom-engine.js';
import { createSupabaseClientFromEnv, SupabaseStorage } from './storage.js';
import { defaultLogger } from './logger.js';
import { AssistRequestContext, StorageClient, Logger } from './types.js';

const domMapSchema = z.object({
  url: z.string().url(),
  fields: z.array(z.string()).min(1),
  snapshotId: z.string().optional()
});

const fillSchema = z.object({
  map: z.object({
    mapped: z.record(z.string()),
    confidence: z.number(),
    snapshotId: z.string().optional()
  }),
  values: z.record(z.string()),
  visitId: z.string()
});

const undoSchema = z.object({
  visitId: z.string(),
  lastApplied: z.array(z.string())
});

const assistSchema = z.object({
  visitId: z.string(),
  clinicianId: z.string().optional(),
  patientId: z.string().optional(),
  generatedBy: z.string().optional()
});

async function probeDeepgram(apiKey?: string): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  if (!apiKey) return { ok: false, error: 'missing_api_key' };
  const start = Date.now();
  try {
    const res = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { Authorization: `Token ${apiKey}` },
      method: 'GET'
    });
    return { ok: res.ok, latencyMs: Date.now() - start, error: res.ok ? undefined : res.statusText };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export function createApp(options?: {
  storage?: StorageClient;
  logger?: Logger;
  deepgramApiKey?: string;
  domEngine?: DomAutomationEngine;
  deepgramProbe?: typeof probeDeepgram;
}) {
  const app = express();
  const logger = options?.logger || defaultLogger;
  app.use(express.json());

  const supabase = options?.storage
    ? options.storage
    : (() => {
        const client = createSupabaseClientFromEnv();
        if (!client) throw new Error('Supabase not configured');
        return new SupabaseStorage(client);
      })();
  const assistService = new AssistService(supabase);
  const domEngine = options?.domEngine || new DomAutomationEngine();
  const deepgramHealth = options?.deepgramProbe || probeDeepgram;

  app.get('/health', async (_req, res) => {
    const [storageHealth, dgHealth] = await Promise.all([
      supabase.health().catch((error) => ({ ok: false, error: (error as Error).message })),
      deepgramHealth(options?.deepgramApiKey || process.env.DEEPGRAM_API_KEY)
    ]);
    res.json({
      status: storageHealth.ok && dgHealth.ok ? 'ok' : 'degraded',
      storage: storageHealth,
      deepgram: dgHealth,
      automation: domEngine.getMetrics()
    });
  });

  app.post('/dom/map', (req, res) => {
    const parse = domMapSchema.safeParse(req.body);
    if (!parse.success) {
      logger.warn('map_validation_failed', { issues: parse.error.issues });
      return res.status(400).json({ error: 'invalid_request', details: parse.error.issues });
    }
    try {
      const result = domEngine.mapDocument(parse.data);
      logger.info('dom_mapped', { url: parse.data.url, confidence: result.confidence });
      return res.json(result);
    } catch (error) {
      logger.error('dom_map_failed', { url: parse.data.url, error: (error as Error).message });
      return res.status(500).json({ error: 'map_failed', message: (error as Error).message });
    }
  });

  app.post('/actions/fill', (req, res) => {
    const parse = fillSchema.safeParse(req.body);
    if (!parse.success) {
      logger.warn('fill_validation_failed', { issues: parse.error.issues });
      return res.status(400).json({ error: 'invalid_request', details: parse.error.issues });
    }
    try {
      const result = domEngine.performFill(parse.data);
      logger.info('fill_applied', { visitId: parse.data.visitId, applied: result.applied.length, failed: result.failed.length });
      return res.json(result);
    } catch (error) {
      logger.error('fill_failed', {
        visitId: parse.data.visitId,
        error: (error as Error).message,
        values: Object.keys(parse.data.values)
      });
      return res.status(500).json({ error: 'fill_failed', message: (error as Error).message });
    }
  });

  app.post('/actions/undo', (req, res) => {
    const parse = undoSchema.safeParse(req.body);
    if (!parse.success) {
      logger.warn('undo_validation_failed', { issues: parse.error.issues });
      return res.status(400).json({ error: 'invalid_request', details: parse.error.issues });
    }
    try {
      const result = domEngine.undoLast(parse.data);
      logger.info('undo_applied', { visitId: parse.data.visitId, count: result.undone.length });
      return res.json(result);
    } catch (error) {
      logger.error('undo_failed', { visitId: parse.data.visitId, error: (error as Error).message });
      return res.status(500).json({ error: 'undo_failed', message: (error as Error).message });
    }
  });

  app.post('/assist/summary', async (req, res) => {
    const parse = assistSchema.safeParse(req.body);
    if (!parse.success) {
      logger.warn('assist_validation_failed', { issues: parse.error.issues });
      return res.status(400).json({ error: 'invalid_request', details: parse.error.issues });
    }
    const context: AssistRequestContext = parse.data;
    try {
      const result = await assistService.generateSummary(context);
      return res.json(result);
    } catch (error) {
      logger.error('summary_generation_failed', { error: (error as Error).message });
      return res.status(500).json({ error: 'summary_failed' });
    }
  });

  app.post('/assist/soap', async (req, res) => {
    const parse = assistSchema.safeParse(req.body);
    if (!parse.success) {
      logger.warn('assist_validation_failed', { issues: parse.error.issues });
      return res.status(400).json({ error: 'invalid_request', details: parse.error.issues });
    }
    const context: AssistRequestContext = parse.data;
    try {
      const result = await assistService.generateSoap(context);
      return res.json(result);
    } catch (error) {
      logger.error('soap_generation_failed', { error: (error as Error).message });
      return res.status(500).json({ error: 'soap_failed' });
    }
  });

  return app;
}
