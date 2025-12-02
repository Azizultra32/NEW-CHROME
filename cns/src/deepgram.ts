import { defaultLogger } from './logger.js';
import { DeepgramChunk, EnrichedChunk, Logger, SessionMetadata, StorageClient } from './types.js';

function mapSpeakerRole(chunk: DeepgramChunk, session: SessionMetadata): { role: EnrichedChunk['role']; alerts: string[] } {
  const alerts: string[] = [];
  const mapping = session.speakerRoles || {};
  const key = chunk.speaker !== undefined ? String(chunk.speaker) : undefined;
  if (key && mapping[key]) {
    return { role: mapping[key], alerts };
  }

  if (session.alertOnUnknownSpeaker) {
    alerts.push('unknown_speaker');
  }

  // fallback: assume speaker 0 clinician, 1 patient
  if (chunk.speaker === 0) return { role: 'clinician', alerts };
  if (chunk.speaker === 1) return { role: 'patient', alerts };

  return { role: 'unknown', alerts };
}

export function enrichChunk(chunk: DeepgramChunk, session: SessionMetadata): EnrichedChunk {
  const { role, alerts } = mapSpeakerRole(chunk, session);
  return {
    ...chunk,
    role,
    alerts,
    visitId: session.visitId,
    sessionId: session.sessionId,
    clinicianId: session.clinicianId,
    patientId: session.patientId,
    consentRequired: session.consentRequired ?? true,
    consentGranted: session.consentGranted ?? false
  };
}

async function persistWithRetry(
  storage: StorageClient,
  chunk: EnrichedChunk,
  logger: Logger,
  retries = 2
): Promise<boolean> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt <= retries) {
    try {
      await storage.insertTranscriptChunk(chunk);
      return true;
    } catch (error) {
      lastError = error;
      logger.warn('persist_chunk_failed', { attempt, error: (error as Error).message });
      attempt += 1;
    }
  }
  logger.error('persist_chunk_exhausted', { error: lastError instanceof Error ? lastError.message : 'unknown' });
  return false;
}

export async function processDeepgramChunk(params: {
  chunk: DeepgramChunk;
  session: SessionMetadata;
  storage: StorageClient;
  broadcast: (chunk: EnrichedChunk) => void | Promise<void>;
  logger?: Logger;
  retries?: number;
}): Promise<{ enriched: EnrichedChunk; persisted: boolean }> {
  const logger = params.logger || defaultLogger;
  const enriched = enrichChunk(params.chunk, params.session);

  const persisted = await persistWithRetry(params.storage, enriched, logger, params.retries ?? 2);
  if (!persisted) {
    enriched.alerts = [...enriched.alerts, 'storage_failure'];
  }

  await Promise.resolve(params.broadcast(enriched));
  return { enriched, persisted };
}
