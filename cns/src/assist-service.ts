import { EnrichedChunk, AssistRequestContext, StorageClient } from './types.js';

function composeSummary(chunks: EnrichedChunk[], context: AssistRequestContext): string {
  const transcript = chunks.map((c) => `${c.role}: ${c.transcript}`).join(' ');
  return `Visit ${context.visitId} summary for ${context.patientId || 'patient'}: ${transcript}`;
}

function composeSoap(chunks: EnrichedChunk[], context: AssistRequestContext): string {
  const subjective = chunks
    .filter((c) => c.role === 'patient')
    .map((c) => c.transcript)
    .join(' ');
  const objective = chunks
    .filter((c) => c.role !== 'patient')
    .map((c) => c.transcript)
    .join(' ');
  return `SOAP v${context.visitId}\nS: ${subjective || 'n/a'}\nO: ${objective || 'n/a'}\nA/P: Pending clinician input.`;
}

export class AssistService {
  constructor(private readonly storage: StorageClient) {}

  async generateSummary(context: AssistRequestContext): Promise<{ content: string; version: number; id: string }> {
    const [chunks, patient] = await Promise.all([
      this.storage.fetchTranscriptChunks(context.visitId),
      this.storage.fetchPatientContext(context.visitId)
    ]);
    const content = composeSummary(chunks, { ...context, ...patient });
    const saved = await this.storage.persistGeneratedNote({
      visitId: context.visitId,
      type: 'summary',
      content,
      generatedBy: context.generatedBy
    });
    return { content: saved.content, version: saved.version, id: saved.id };
  }

  async generateSoap(context: AssistRequestContext): Promise<{ content: string; version: number; id: string }> {
    const [chunks, patient] = await Promise.all([
      this.storage.fetchTranscriptChunks(context.visitId),
      this.storage.fetchPatientContext(context.visitId)
    ]);
    const content = composeSoap(chunks, { ...context, ...patient });
    const saved = await this.storage.persistGeneratedNote({
      visitId: context.visitId,
      type: 'soap',
      content,
      generatedBy: context.generatedBy
    });
    return { content: saved.content, version: saved.version, id: saved.id };
  }
}
