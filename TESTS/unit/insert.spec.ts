import { describe, it, expect, beforeEach, vi } from 'vitest';
import { verifyTarget, listMatchingSelectors } from '../../src/sidepanel/lib/insert';
import type { FieldMapping } from '../../src/sidepanel/lib/mapping';

const baseTab = { id: 1, windowId: 1, active: true, lastFocusedWindow: true } as const;

describe('verifyTarget', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    const executeScript = vi.fn(async ({ func, args }: any) => [{ result: func(...args) }]);
    const tabsQuery = vi.fn(async () => [baseTab]);
    const tabsUpdate = vi.fn(async () => {});
    const windowsUpdate = vi.fn(async () => {});
    (globalThis as any).chrome = {
      scripting: { executeScript },
      tabs: { query: tabsQuery, update: tabsUpdate },
      windows: { update: windowsUpdate }
    };
  });

  it('returns ok for editable textarea', async () => {
    document.body.innerHTML = '<textarea id="field"></textarea>';
    const mapping: FieldMapping = {
      section: 'PLAN',
      selector: '#field',
      strategy: 'value',
      verified: true
    };
    const res = await verifyTarget(mapping);
    expect(res).toEqual({ ok: true });
  });

  it('uses fallback selectors when primary missing', async () => {
    document.body.innerHTML = '<textarea id="fallback"></textarea>';
    const mapping: FieldMapping = {
      section: 'PLAN',
      selector: '#missing',
      strategy: 'value',
      verified: false,
      fallbackSelectors: ['#fallback']
    };
    const res = await verifyTarget(mapping);
    expect(res).toEqual({ ok: true });
  });

  it('returns not_editable for non-editable element', async () => {
    document.body.innerHTML = '<div id="static">Read only</div>';
    const mapping: FieldMapping = {
      section: 'PLAN',
      selector: '#static',
      strategy: 'value',
      verified: false
    };
    const res = await verifyTarget(mapping);
    expect(res).toEqual({ ok: false, reason: 'not_editable' });
  });

  it('returns missing when selector not found', async () => {
    const mapping: FieldMapping = {
      section: 'PLAN',
      selector: '#absent',
      strategy: 'value',
      verified: false
    };
    const res = await verifyTarget(mapping);
    expect(res).toEqual({ ok: false, reason: 'missing' });
  });

  it('collects matching selectors for chooser', async () => {
    document.body.innerHTML = '<textarea id="planA"></textarea><textarea id="planB"></textarea>';
    const mapping: FieldMapping = {
      section: 'PLAN',
      selector: '#planA',
      strategy: 'value',
      verified: false,
      fallbackSelectors: ['#planB', '#missing']
    };
    const res = await listMatchingSelectors(mapping);
    expect(res).toEqual(['#planA', '#planB']);
  });
});
