import { SessionMetadata, StorageClient } from './types.js';
import { defaultLogger } from './logger.js';

export async function resolveSessionIdentifiers(
  session: SessionMetadata,
  storage: StorageClient,
  logger = defaultLogger
): Promise<SessionMetadata> {
  if (session.clinicianId && session.patientId) {
    return session;
  }
  if (!session.visitId) {
    logger.warn('session_missing_visit', { sessionId: session.sessionId });
    return session;
  }

  try {
    const visit = await storage.fetchPatientContext(session.visitId);
    return {
      ...session,
      clinicianId: session.clinicianId || visit.clinicianId,
      patientId: session.patientId || visit.patientId
    };
  } catch (error) {
    logger.warn('session_lookup_failed', {
      sessionId: session.sessionId,
      visitId: session.visitId,
      error: error instanceof Error ? error.message : 'unknown'
    });
    return session;
  }
}
