#!/usr/bin/env node
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import process from 'process';

async function loadRegistry() {
  const registryPath = resolve('openspec/registry.json');
  const raw = await readFile(registryPath, 'utf8');
  return JSON.parse(raw);
}

async function validateSpec(name, strict = false) {
  const registry = await loadRegistry();
  const entry = registry[name];
  if (!entry) {
    console.error(`Unknown spec: ${name}`);
    process.exitCode = 1;
    return;
  }
  const path = resolve(entry.path);
  const content = await readFile(path, 'utf8');
  const missingSections = (entry.requiredSections || []).filter((section) => !content.includes(section));
  if (missingSections.length) {
    console.error(`Spec ${name} missing sections: ${missingSections.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  if (strict) {
    for (const section of entry.requiredSections || []) {
      const idx = content.indexOf(section);
      const nextIdx = entry.requiredSections
        .map((s) => (s === section ? Number.POSITIVE_INFINITY : content.indexOf(s)))
        .filter((n) => n > idx)
        .sort((a, b) => a - b)[0];
      const slice = content.slice(idx, Number.isFinite(nextIdx) ? nextIdx : undefined).trim();
      const lines = slice.split('\n').filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        console.error(`Spec ${name} has empty section for ${section}`);
        process.exitCode = 1;
        return;
      }
    }
  }
  console.log(`Spec ${name} validated${strict ? ' (strict)' : ''}.`);
}

async function main() {
  const [, , command, specName, maybeStrict] = process.argv;
  if (!command || command === '--help') {
    console.log('Usage: openspec validate <specName> [--strict]');
    process.exit(0);
  }
  if (command !== 'validate') {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
  if (!specName) {
    console.error('Missing spec name');
    process.exit(1);
  }
  const strict = maybeStrict === '--strict';
  await validateSpec(specName, strict);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
