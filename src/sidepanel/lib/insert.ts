import type { FieldMapping, Strategy } from './mapping';

export async function insertTextInto(selector: string, text: string, framePath?: number[]): Promise<Strategy | 'fail'> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return 'fail';

  const execResult = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (sel: string, value: string, path?: number[]) => {
      // Navigate to target document within same-origin frame path
      let w: Window & typeof globalThis = window;
      try {
        if (Array.isArray(path) && path.length) {
          for (const i of path) {
            // @ts-ignore
            w = w.frames[i];
            if (!w) break;
          }
        }
      } catch {
        return 'fail';
      }
      const doc = w?.document || document;
      const el = (doc.querySelector(sel) as any) || null;
      if (!el) return 'fail';
      if (el.isContentEditable) {
        el.focus();
        const ok = (doc as Document).execCommand('insertText', false, value);
        return ok ? 'execCommand' : 'fail';
      }
      if ('value' in el) {
        el.focus();
        el.value = value;
        el.dispatchEvent(new (w as any).Event('input', { bubbles: true }));
        return 'value';
      }
      return 'fail';
    },
    args: [selector, text, framePath]
  }).catch(() => null);

  const directResult = execResult?.[0]?.result as Strategy | 'fail' | undefined;
  if (directResult && directResult !== 'fail') return directResult;

  try {
    await navigator.clipboard.writeText(text);
  } catch {}

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (path?: number[]) => {
      // Dispatch paste keystroke inside the target frame to leverage clipboard fallback
      let w: Window & typeof globalThis = window;
      try {
        if (Array.isArray(path) && path.length) {
          for (const i of path) {
            // @ts-ignore
            w = w.frames[i];
            if (!w) break;
          }
        }
      } catch {}
      const isMac = (w.navigator?.platform || navigator.platform).toUpperCase().includes('MAC');
      const ev = new (w as any).KeyboardEvent('keydown', {
        key: 'v',
        metaKey: isMac,
        ctrlKey: !isMac,
        bubbles: true
      });
      try { (w.document?.activeElement as any)?.dispatchEvent(ev); } catch {}
    },
    args: [framePath]
  }).catch(() => {});

  return 'clipboard';
}

// Resolve a target tab for popup mappings; for page/iframe, use active tab.
async function resolveTargetTabId(mapping?: FieldMapping): Promise<number | null> {
  if (!mapping || mapping.target === 'page' || mapping.target === 'iframe') {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? null;
  }
  // Popup search by URL pattern or title
  const tabs = await chrome.tabs.query({});
  let candidates = tabs;
  if (mapping.popupUrlPattern) {
    const pat = mapping.popupUrlPattern.replace(/\*/g, '');
    candidates = candidates.filter((t) => (t.url || '').includes(pat));
  }
  if ((!candidates || candidates.length === 0) && mapping.popupTitleIncludes) {
    candidates = tabs.filter((t) => (t.title || '').toLowerCase().includes(mapping.popupTitleIncludes!.toLowerCase()));
  }
  // Prefer the most recently active candidate (descending by lastAccessed when available)
  const tab = (candidates && candidates.length)
    ? candidates.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0]
    : null;
  if (!tab?.id) return null;
  try {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  } catch {}
  return tab.id;
}

export async function insertUsingMapping(mapping: FieldMapping, text: string): Promise<Strategy | 'fail'> {
  const tabId = await resolveTargetTabId(mapping);
  if (!tabId) return 'fail';
  const execResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string, value: string, path?: number[]) => {
      let w: Window & typeof globalThis = window;
      try {
        if (Array.isArray(path) && path.length) {
          for (const i of path) { w = (w.frames[i] as any); if (!w) break; }
        }
      } catch { return 'fail'; }
      const doc = w?.document || document;
      const el = (doc.querySelector(sel) as any) || null;
      if (!el) return 'fail';
      if (el.isContentEditable) {
        el.focus();
        const ok = (doc as Document).execCommand('insertText', false, value);
        return ok ? 'execCommand' : 'fail';
      }
      if ('value' in el) {
        el.focus();
        el.value = value;
        el.dispatchEvent(new (w as any).Event('input', { bubbles: true }));
        return 'value';
      }
      return 'fail';
    },
    args: [mapping.selector, text, mapping.framePath]
  }).catch(() => null);

  const directResult = execResult?.[0]?.result as Strategy | 'fail' | undefined;
  if (directResult && directResult !== 'fail') return directResult;

  try { await navigator.clipboard.writeText(text); } catch {}

  await chrome.scripting.executeScript({
    target: { tabId },
    func: (path?: number[]) => {
      let w: Window & typeof globalThis = window;
      try { if (Array.isArray(path) && path.length) { for (const i of path) { w = (w.frames[i] as any); if (!w) break; } } } catch {}
      const isMac = (w.navigator?.platform || navigator.platform).toUpperCase().includes('MAC');
      const ev = new (w as any).KeyboardEvent('keydown', { key: 'v', metaKey: isMac, ctrlKey: !isMac, bubbles: true });
      try { (w.document?.activeElement as any)?.dispatchEvent(ev); } catch {}
    },
    args: [mapping.framePath]
  }).catch(() => {});

  return 'clipboard';
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'missing' | 'not_editable' };

export async function verifyTarget(mapping: FieldMapping): Promise<VerifyResult> {
  const tabId = await resolveTargetTabId(mapping);
  if (!tabId) return { ok: false, reason: 'missing' };
  const res = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string, path?: number[]) => {
      let w: Window & typeof globalThis = window;
      try { if (Array.isArray(path) && path.length) { for (const i of path) { w = (w.frames[i] as any); if (!w) break; } } } catch { return { ok: false, reason: 'missing' } as any; }
      const doc = w?.document || document;
      const el = (doc.querySelector(sel) as any) || null;
      if (!el) return { ok: false, reason: 'missing' } as any;
      const editable = !!(el.isContentEditable || 'value' in el);
      return editable ? ({ ok: true } as any) : ({ ok: false, reason: 'not_editable' } as any);
    },
    args: [mapping.selector, mapping.framePath]
  }).catch(() => null);
  const out = (res && res[0] && res[0].result) as VerifyResult | undefined;
  return out || { ok: false, reason: 'missing' };
}
