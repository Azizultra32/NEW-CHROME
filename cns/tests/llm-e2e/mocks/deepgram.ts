import { readFileSync } from 'fs';
import { resolve } from 'path';
import { vi } from 'vitest';
import { DeepgramChunk } from '../../src/types.js';

export function loadFixtureTranscript(): DeepgramChunk[] {
  const path = resolve('cns/tests/llm-e2e/fixtures/transcript.json');
  const json = readFileSync(path, 'utf8');
  return JSON.parse(json);
}

export function createMockDeepgramClient() {
  return {
    streamTranscript: vi.fn(async () => loadFixtureTranscript())
  };
}
