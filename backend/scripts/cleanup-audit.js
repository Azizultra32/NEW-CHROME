#!/usr/bin/env node
// Cleanup audit_screenshots older than N days (default 30)
import { readdir, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';

const DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS || '30', 10);
const ROOT = join(process.cwd(), 'audit_screenshots');

async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  const now = Date.now();
  for (const e of entries) {
    const p = join(dir, e.name);
    try {
      if (e.isDirectory()) {
        await walk(p);
        continue;
      }
      const st = await stat(p);
      const ageDays = (now - st.mtimeMs) / (1000 * 60 * 60 * 24);
      if (ageDays > DAYS) {
        await rm(p, { force: true });
        // eslint-disable-next-line no-console
        console.log('[cleanup-audit] removed', p);
      }
    } catch {
      // ignore individual errors
    }
  }
  // Write last cleanup timestamp marker
  try {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(ROOT, '.last_cleanup'), JSON.stringify({ ts: Date.now() }), 'utf8');
  } catch {}
}

walk(ROOT).catch((err) => {
  console.error('[cleanup-audit] failed', err);
  process.exit(1);
});
