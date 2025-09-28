#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

const env = {
  ...process.env,
  RUN_EXTENSION_E2E: 'true',
  PLAYWRIGHT_CHANNEL: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  HEADED: process.env.HEADED || 'true'
};

const extraArgs = process.argv.slice(2);
const runner = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(runner, ['playwright', 'test', '--config', 'playwright.config.ts', '--headed', ...extraArgs], {
  cwd: root,
  env,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
