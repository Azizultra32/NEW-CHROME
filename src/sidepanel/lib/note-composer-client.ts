/**
 * Note Composer Client
 *
 * Client library for calling the backend note composition endpoint.
 */

import type { PHIMap } from './phi-rehydration';
import { fetchWithTimeout } from './net';

export interface ComposedNote {
  sections: Record<string, string>;
  provenance: Array<{
    sentence: string;
    timestamp: string;
    speaker: string;
    section: string;
  }>;
  flags: Array<{
    type: 'uncertainty' | 'contradiction' | 'upcoding_risk' | 'missing_info';
    text: string;
    section: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  metadata: {
    model: string;
    noteFormat: string;
    specialty: string;
    generatedAt: string;
    encounterId: string;
    tokenUsage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };
}

export interface ComposeNoteParams {
  encounterId: string;
  transcript: string; // Tokenized transcript
  phiMap: PHIMap;
  noteFormat?: 'SOAP' | 'APSO' | 'HPO';
  specialty?: string;
  apiBase?: string;
}

/**
 * Compose clinical note from transcript
 * @param params - Composition parameters
 * @returns Composed note with provenance and flags
 */
export async function composeNote(
  params: ComposeNoteParams
): Promise<ComposedNote> {
  const {
    encounterId,
    transcript,
    phiMap,
    noteFormat = 'SOAP',
    specialty = 'family_medicine',
    apiBase = 'http://localhost:8080'
  } = params;

  const url = `${apiBase}/v1/encounters/${encounterId}/compose`;

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      transcript,
      phiMap,
      noteFormat,
      specialty
    })
  }, 30000);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Note composition failed: ${error.error || response.statusText}`);
  }

  return await response.json();
}

/**
 * Get section template
 * @param section - Section name (PLAN, HPI, ROS, EXAM)
 * @param specialty - Medical specialty
 * @param apiBase - API base URL
 * @returns Template text
 */
export async function getTemplate(
  section: string,
  specialty: string = 'family_medicine',
  apiBase: string = 'http://localhost:8080'
): Promise<string> {
  const url = `${apiBase}/v1/templates/${section}?specialty=${specialty}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to get template: ${response.statusText}`);
  }

  const data = await response.json();
  return data.template;
}

/**
 * Query audit logs
 * @param encounterId - Filter by encounter ID
 * @param apiBase - API base URL
 * @returns Audit logs
 */
export async function queryAuditLogs(
  encounterId?: string,
  apiBase: string = 'http://localhost:8080'
): Promise<any[]> {
  const url = encounterId
    ? `${apiBase}/v1/audit/logs?encounterId=${encounterId}`
    : `${apiBase}/v1/audit/logs`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to query audit logs: ${response.statusText}`);
  }

  const data = await response.json();
  return data.logs;
}

/**
 * Get backend health status
 * @param apiBase - API base URL
 * @returns Health status
 */
export async function checkHealth(
  apiBase: string = 'http://localhost:8080'
): Promise<{
  status: string;
  features: Record<string, boolean>;
}> {
  const response = await fetch(`${apiBase}/health`);

  if (!response.ok) {
    throw new Error('Backend unhealthy');
  }

  return await response.json();
}

/**
 * Format provenance timestamp for display
 * @param timestamp - Timestamp string (MM:SS or HH:MM:SS)
 * @returns Formatted timestamp
 */
export function formatProvenanceTime(timestamp: string): string {
  return timestamp.startsWith('[') ? timestamp : `[${timestamp}]`;
}

/**
 * Group flags by severity
 * @param flags - Safety flags
 * @returns Grouped flags
 */
export function groupFlagsBySeverity(
  flags: ComposedNote['flags']
): {
  high: typeof flags;
  medium: typeof flags;
  low: typeof flags;
} {
  return {
    high: flags.filter(f => f.severity === 'high'),
    medium: flags.filter(f => f.severity === 'medium'),
    low: flags.filter(f => f.severity === 'low')
  };
}

/**
 * Check if note has critical issues
 * @param note - Composed note
 * @returns True if critical issues exist
 */
export function hasCriticalIssues(note: ComposedNote): boolean {
  return note.flags.some(f => f.severity === 'high');
}

/**
 * Extract section text for Smart Paste
 * @param note - Composed note
 * @param section - Section name
 * @returns Section text or empty string
 */
export function extractSectionText(
  note: ComposedNote,
  section: string
): string {
  return note.sections[section] || '';
}

/**
 * Get note summary for display
 * @param note - Composed note
 * @returns Summary string
 */
export function getNoteSummary(note: ComposedNote): string {
  const sectionCount = Object.keys(note.sections).length;
  const flagCount = note.flags.length;
  const criticalCount = note.flags.filter(f => f.severity === 'high').length;

  let summary = `${sectionCount} sections`;

  if (flagCount > 0) {
    summary += `, ${flagCount} flag${flagCount !== 1 ? 's' : ''}`;
    if (criticalCount > 0) {
      summary += ` (${criticalCount} critical)`;
    }
  }

  return summary;
}
