import { test, expect, request } from '@playwright/test';
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createConnection } from 'net';

const __dirname = dirname(fileURLToPath(import.meta.url));

test.describe('Mock server endpoints', () => {
  let proc: any;

  test.beforeAll(async () => {
    proc = spawn('node', ['server.js'], { cwd: join(__dirname, '../../'), stdio: 'ignore' });
    await waitForPort(8080, 5000);
  });

  test.afterAll(async () => {
    try { proc.kill(); } catch {}
  });

  test('presign and audit respond OK', async ({}) => {
    const ctx = await request.newContext();
    const presign = await ctx.post('http://localhost:8080/v1/encounters/123/presign', { data: { mode: 'whisper' } });
    expect(presign.ok()).toBeTruthy();
    const data = await presign.json();
    expect(data.wssUrl).toContain('/asr');

    const audit = await ctx.post('http://localhost:8080/v1/audit', { data: { type: 'acceptance_probe', extra: { ok: true } } });
    expect(audit.ok()).toBeTruthy();
    const a = await audit.json();
    expect(a.ok).toBeTruthy();
  });
});

async function waitForPort(port: number, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await new Promise<boolean>((resolve) => {
      const socket = createConnection(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.end();
        resolve(true);
      });
      socket.once('error', () => {
        resolve(false);
      });
    });
    if (ready) return;
    await new Promise((res) => setTimeout(res, 200));
  }
  throw new Error(`Mock server on port ${port} did not start in ${timeoutMs}ms`);
}
