import { test, expect } from '@playwright/test';
import { existsSync, statSync } from 'fs';
import { join } from 'path';

test('dist build has expected files', async () => {
  const root = join(__dirname, '../../');
  const dist = join(root, 'dist');
  expect(existsSync(dist)).toBeTruthy();
  for (const f of ['manifest.json', 'sidepanel.html', 'background.js', 'content.js', 'offscreen.html', 'offscreen.js']) {
    expect(existsSync(join(dist, f))).toBeTruthy();
  }
  expect(statSync(join(dist, 'assets/sidepanel.js')).size).toBeGreaterThan(50_000);
});

