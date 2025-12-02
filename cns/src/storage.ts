import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { EnrichedChunk, StorageClient } from './types.js';

export function createSupabaseClientFromEnv(): SupabaseClient | undefined {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return undefined;
  return createClient(url, key);
}

export class SupabaseStorage implements StorageClient {
  constructor(private readonly client: SupabaseClient) {}

  async insertTranscriptChunk(chunk: EnrichedChunk): Promise<void> {
    const { error } = await this.client.from('transcript_chunks').insert({
      chunk_id: chunk.id,
      visit_id: chunk.visitId,
      session_id: chunk.sessionId,
      role: chunk.role,
      transcript: chunk.transcript,
      start: chunk.start,
      end: chunk.end,
      speaker: chunk.speaker,
      clinician_id: chunk.clinicianId,
      patient_id: chunk.patientId,
      consent_required: chunk.consentRequired,
      consent_granted: chunk.consentGranted,
      alerts: chunk.alerts
    });
    if (error) {
      throw new Error(error.message);
    }
  }

  async fetchTranscriptChunks(visitId: string): Promise<EnrichedChunk[]> {
    const { data, error } = await this.client
      .from('transcript_chunks')
      .select('*')
      .eq('visit_id', visitId)
      .order('start', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map((row) => ({
      id: row.chunk_id,
      start: row.start,
      end: row.end,
      transcript: row.transcript,
      channel: row.channel,
      speaker: row.speaker,
      isFinal: row.is_final,
      role: row.role,
      alerts: row.alerts || [],
      visitId: row.visit_id,
      sessionId: row.session_id,
      clinicianId: row.clinician_id,
      patientId: row.patient_id,
      consentRequired: row.consent_required,
      consentGranted: row.consent_granted
    }));
  }

  async fetchPatientContext(visitId: string): Promise<{ visitId: string; patientId?: string; clinicianId?: string }> {
    const { data, error } = await this.client
      .from('visits')
      .select('patient_id, clinician_id')
      .eq('id', visitId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { visitId, patientId: data?.patient_id, clinicianId: data?.clinician_id };
  }

  async persistGeneratedNote(params: {
    visitId: string;
    type: 'summary' | 'soap';
    content: string;
    generatedBy?: string;
  }): Promise<{ id: string; version: number; visitId: string; content: string; type: 'summary' | 'soap' }> {
    const { data: existing, error: countError } = await this.client
      .from('generated_notes')
      .select('version', { count: 'exact', head: true })
      .eq('visit_id', params.visitId)
      .eq('type', params.type);
    if (countError) throw new Error(countError.message);

    const nextVersion = (existing?.length || 0) + 1;
    const { data, error } = await this.client
      .from('generated_notes')
      .insert({
        visit_id: params.visitId,
        type: params.type,
        content: params.content,
        version: nextVersion,
        generated_by: params.generatedBy
      })
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      id: data?.id,
      version: data?.version ?? nextVersion,
      visitId: params.visitId,
      content: params.content,
      type: params.type
    };
  }

  async health(): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.client.from('transcript_chunks').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
}
