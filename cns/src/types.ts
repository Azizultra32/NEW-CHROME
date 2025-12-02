export type SpeakerRole = 'clinician' | 'patient' | 'observer' | 'unknown';

export interface SessionMetadata {
  sessionId: string;
  visitId?: string;
  clinicianId?: string;
  patientId?: string;
  consentRequired?: boolean;
  consentGranted?: boolean;
  speakerRoles?: Record<string, SpeakerRole>;
  alertOnUnknownSpeaker?: boolean;
}

export interface DeepgramChunk {
  id: string;
  start: number;
  end: number;
  transcript: string;
  channel?: number;
  speaker?: number;
  isFinal?: boolean;
  metadata?: Record<string, unknown>;
}

export interface EnrichedChunk extends DeepgramChunk {
  role: SpeakerRole;
  alerts: string[];
  consentRequired: boolean;
  consentGranted: boolean;
  clinicianId?: string;
  patientId?: string;
  visitId?: string;
  sessionId: string;
}

export interface StorageClient {
  insertTranscriptChunk(chunk: EnrichedChunk): Promise<void>;
  fetchTranscriptChunks(visitId: string): Promise<EnrichedChunk[]>;
  fetchPatientContext(visitId: string): Promise<{ visitId: string; patientId?: string; clinicianId?: string }>;
  persistGeneratedNote(params: {
    visitId: string;
    type: 'summary' | 'soap';
    content: string;
    generatedBy?: string;
  }): Promise<{ id: string; version: number; visitId: string; content: string; type: 'summary' | 'soap' }>;
  health(): Promise<{ ok: boolean; error?: string }>;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string | Error, meta?: Record<string, unknown>): void;
}

export interface ConsentManager {
  handleChunk(chunk: EnrichedChunk): Promise<void> | void;
}

export interface DomMapRequest {
  url: string;
  fields: string[];
  snapshotId?: string;
}

export interface DomMapResult {
  mapped: Record<string, string>;
  confidence: number;
  snapshotId?: string;
}

export interface FillActionRequest {
  map: DomMapResult;
  values: Record<string, string>;
  visitId: string;
}

export interface FillActionResult {
  applied: string[];
  failed: string[];
}

export interface UndoActionRequest {
  visitId: string;
  lastApplied: string[];
}

export interface UndoActionResult {
  undone: string[];
}

export interface AssistRequestContext {
  visitId: string;
  clinicianId?: string;
  patientId?: string;
  generatedBy?: string;
}
