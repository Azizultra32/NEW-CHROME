import { test, expect, request } from '@playwright/test';
import { spawn } from 'child_process';

test.describe('Mock server endpoints', () => {
  let proc: any;

  test.beforeAll(async () => {
    proc = spawn('node', ['server.js'], { cwd: __dirname + '/../../' });
    await new Promise((res) => setTimeout(res, 500));
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

