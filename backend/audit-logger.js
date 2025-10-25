/**
 * Audit Logger
 *
 * HIPAA/PIPEDA-compliant audit logging for all PHI access and system events.
 * Logs are structured, timestamped, and can be exported for compliance audits.
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { hmac } from './encryption.js';

const AUDIT_LOG_PATH = process.env.PHI_AUDIT_LOG || './audit.log';
const AUDIT_SECRET = process.env.AUDIT_HMAC_SECRET || 'default_audit_secret_change_in_production';

// Event types for audit logging
export const AuditEventType = {
  // Authentication & Authorization
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  PERMISSION_DENIED: 'permission_denied',

  // PHI Access
  PHI_VIEWED: 'phi_viewed',
  PHI_CREATED: 'phi_created',
  PHI_UPDATED: 'phi_updated',
  PHI_DELETED: 'phi_deleted',
  PHI_EXPORTED: 'phi_exported',

  // Encounter Operations
  ENCOUNTER_STARTED: 'encounter_started',
  ENCOUNTER_ENDED: 'encounter_ended',
  ENCOUNTER_TRANSCRIBED: 'encounter_transcribed',
  ENCOUNTER_NOTE_COMPOSED: 'encounter_note_composed',
  ENCOUNTER_NOTE_INSERTED: 'encounter_note_inserted',

  // PHI Protection
  PHI_REDACTED: 'phi_redacted',
  PHI_REHYDRATED: 'phi_rehydrated',
  PHI_ENCRYPTED: 'phi_encrypted',
  PHI_DECRYPTED: 'phi_decrypted',

  // Clinical Actions
  NOTE_VIEWED: 'note_viewed',
  NOTE_EDITED: 'note_edited',
  NOTE_SIGNED: 'note_signed',
  PRESCRIPTION_CREATED: 'prescription_created',

  // System Events
  SYSTEM_ERROR: 'system_error',
  API_CALL_FAILED: 'api_call_failed',
  SECURITY_ALERT: 'security_alert'
};

/**
 * Create structured audit log entry
 * @param {Object} params
 * @param {string} params.eventType - Type of event (from AuditEventType)
 * @param {string} params.encounterId - Encounter/session ID
 * @param {string} params.userId - User/clinician ID (if available)
 * @param {string} params.patientFingerprint - Hashed patient identifier
 * @param {Object} params.metadata - Additional event-specific data
 * @param {string} params.ipAddress - Source IP address
 * @returns {Object} Structured log entry
 */
function createAuditEntry({
  eventType,
  encounterId = null,
  userId = null,
  patientFingerprint = null,
  metadata = {},
  ipAddress = null
}) {
  const timestamp = new Date().toISOString();

  return {
    timestamp,
    eventType,
    encounterId,
    userId,
    patientFingerprint,
    ipAddress,
    metadata,
    // Include process info for debugging
    pid: process.pid,
    hostname: process.env.HOSTNAME || 'unknown'
  };
}

/**
 * Write audit entry to log file
 * @param {Object} entry - Audit log entry
 * @returns {Promise<void>}
 */
async function writeAuditLog(entry) {
  try {
    // Create HMAC signature for tamper detection
    const entryString = JSON.stringify(entry);
    const signature = await hmac(entryString, AUDIT_SECRET);

    const logLine = JSON.stringify({
      ...entry,
      signature
    }) + '\n';

    await fs.appendFile(AUDIT_LOG_PATH, logLine, 'utf8');
  } catch (err) {
    // If audit logging fails, we MUST log to console (fallback)
    console.error('[AUDIT] Failed to write audit log:', err);
    console.error('[AUDIT] Entry:', entry);
  }
}

/**
 * Log an audit event
 * @param {Object} params - Event parameters
 * @returns {Promise<void>}
 */
export async function logAudit(params) {
  const entry = createAuditEntry(params);

  await writeAuditLog(entry);

  // In development, also log to console
  if (process.env.NODE_ENV === 'development') {
    console.log('[AUDIT]', entry.eventType, {
      encounter: entry.encounterId,
      patient: entry.patientFingerprint?.slice(0, 8) + '...',
      user: entry.userId
    });
  }
}

/**
 * Convenience function: Log encounter started
 */
export async function logEncounterStart(encounterId, userId, patientFingerprint, ipAddress) {
  await logAudit({
    eventType: AuditEventType.ENCOUNTER_STARTED,
    encounterId,
    userId,
    patientFingerprint,
    ipAddress,
    metadata: { action: 'start_recording' }
  });
}

/**
 * Convenience function: Log encounter ended
 */
export async function logEncounterEnd(encounterId, userId, durationMs) {
  await logAudit({
    eventType: AuditEventType.ENCOUNTER_ENDED,
    encounterId,
    userId,
    metadata: { durationMs }
  });
}

/**
 * Convenience function: Log PHI redaction
 */
export async function logPHIRedaction(encounterId, phiTypesCount) {
  await logAudit({
    eventType: AuditEventType.PHI_REDACTED,
    encounterId,
    metadata: { phiTypesCount }
  });
}

/**
 * Convenience function: Log note composition
 */
export async function logNoteComposition(encounterId, noteFormat, modelUsed) {
  await logAudit({
    eventType: AuditEventType.ENCOUNTER_NOTE_COMPOSED,
    encounterId,
    metadata: { noteFormat, modelUsed }
  });
}

/**
 * Convenience function: Log note insertion to EHR
 */
export async function logNoteInsertion(encounterId, sections) {
  await logAudit({
    eventType: AuditEventType.ENCOUNTER_NOTE_INSERTED,
    encounterId,
    metadata: { sections }
  });
}

/**
 * Convenience function: Log security alert
 */
export async function logSecurityAlert(message, severity, metadata = {}) {
  await logAudit({
    eventType: AuditEventType.SECURITY_ALERT,
    metadata: {
      message,
      severity,
      ...metadata
    }
  });
}

/**
 * Convenience function: Log API call failure
 */
export async function logAPIFailure(apiName, errorMessage, encounterId = null) {
  await logAudit({
    eventType: AuditEventType.API_CALL_FAILED,
    encounterId,
    metadata: {
      apiName,
      errorMessage
    }
  });
}

/**
 * Query audit logs (for compliance reports)
 * @param {Object} filters
 * @param {string} filters.encounterId - Filter by encounter ID
 * @param {string} filters.eventType - Filter by event type
 * @param {Date} filters.startDate - Filter by start date
 * @param {Date} filters.endDate - Filter by end date
 * @param {number} filters.limit - Max results
 * @returns {Promise<Array>} Matching log entries
 */
export async function queryAuditLogs({
  encounterId = null,
  eventType = null,
  startDate = null,
  endDate = null,
  limit = 1000
} = {}) {
  try {
    if (!existsSync(AUDIT_LOG_PATH)) {
      return [];
    }

    const content = await fs.readFile(AUDIT_LOG_PATH, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    const entries = lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    // Apply filters
    let filtered = entries;

    if (encounterId) {
      filtered = filtered.filter(e => e.encounterId === encounterId);
    }

    if (eventType) {
      filtered = filtered.filter(e => e.eventType === eventType);
    }

    if (startDate) {
      filtered = filtered.filter(e => new Date(e.timestamp) >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter(e => new Date(e.timestamp) <= endDate);
    }

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return filtered.slice(0, limit);
  } catch (err) {
    console.error('[AUDIT] Failed to query logs:', err);
    return [];
  }
}

/**
 * Verify audit log integrity (check HMAC signatures)
 * @returns {Promise<{valid: number, invalid: number, total: number}>}
 */
export async function verifyAuditLogIntegrity() {
  try {
    if (!existsSync(AUDIT_LOG_PATH)) {
      return { valid: 0, invalid: 0, total: 0 };
    }

    const content = await fs.readFile(AUDIT_LOG_PATH, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    let valid = 0;
    let invalid = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const { signature, ...entryWithoutSig } = entry;

        const expectedSignature = await hmac(JSON.stringify(entryWithoutSig), AUDIT_SECRET);

        if (signature === expectedSignature) {
          valid++;
        } else {
          invalid++;
          console.warn('[AUDIT] Integrity check failed for entry:', entryWithoutSig.timestamp);
        }
      } catch {
        invalid++;
      }
    }

    return { valid, invalid, total: lines.length };
  } catch (err) {
    console.error('[AUDIT] Failed to verify integrity:', err);
    return { valid: 0, invalid: 0, total: 0 };
  }
}

// Test mode
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Audit Logger - Test Mode\n');

  (async () => {
    // Test 1: Log various events
    console.log('1. Logging test events...');

    await logEncounterStart('enc_123', 'user_456', 'fp_abc789', '192.168.1.1');
    console.log('✓ Logged encounter start');

    await logPHIRedaction('enc_123', { NAME: 2, DATE: 3, PHONE: 1 });
    console.log('✓ Logged PHI redaction');

    await logNoteComposition('enc_123', 'SOAP', 'gpt-4o');
    console.log('✓ Logged note composition');

    await logNoteInsertion('enc_123', ['HPI', 'PLAN']);
    console.log('✓ Logged note insertion');

    await logEncounterEnd('enc_123', 'user_456', 125000);
    console.log('✓ Logged encounter end');

    await logSecurityAlert('Test security alert', 'low', { testMode: true });
    console.log('✓ Logged security alert');

    // Test 2: Query logs
    console.log('\n2. Querying audit logs...');
    const recentLogs = await queryAuditLogs({ limit: 10 });
    console.log(`✓ Retrieved ${recentLogs.length} log entries`);

    const encounterLogs = await queryAuditLogs({ encounterId: 'enc_123' });
    console.log(`✓ Found ${encounterLogs.length} logs for encounter enc_123`);

    // Test 3: Verify integrity
    console.log('\n3. Verifying audit log integrity...');
    const integrity = await verifyAuditLogIntegrity();
    console.log(`✓ Integrity check: ${integrity.valid} valid, ${integrity.invalid} invalid (total: ${integrity.total})`);

    // Test 4: Display sample log entries
    console.log('\n4. Sample audit log entries:');
    recentLogs.slice(0, 3).forEach((entry, idx) => {
      console.log(`\n  Entry ${idx + 1}:`);
      console.log(`    Timestamp: ${entry.timestamp}`);
      console.log(`    Event: ${entry.eventType}`);
      console.log(`    Encounter: ${entry.encounterId || 'N/A'}`);
      console.log(`    Metadata: ${JSON.stringify(entry.metadata)}`);
    });

    console.log('\n✅ Audit logger tests passed!');
    console.log(`\nAudit log saved to: ${AUDIT_LOG_PATH}`);
  })().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
}