import type { FieldMapping, Strategy } from './mapping';

type SelectorOptions = {
  preferredSelector?: string;
  strict?: boolean;
};

type InsertOptions = SelectorOptions;

export type InsertResult =
  | { ok: true; strategy: Strategy | 'clipboard'; selector: string }
  | { ok: false };

function buildSelectorList(primary: string, fallbacks: string[] | undefined, preferred?: string, strict?: boolean) {
  const base = [primary].concat(Array.isArray(fallbacks) ? fallbacks : []).filter(Boolean);
  if (!base.length) return [] as string[];
  if (!preferred) return Array.from(new Set(base));
  if (strict) {
    return base.includes(preferred) ? [preferred] : [preferred];
  }
  const rest = base.filter((s) => s !== preferred);
  return [preferred].concat(rest.filter(Boolean));
}

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
      // ContentEditable: prefer Range insertion, fallback to execCommand
      if (el.isContentEditable) {
        try {
          el.focus();
          const selection = (w.getSelection && w.getSelection()) || (doc as any).getSelection?.();
          if (selection && selection.rangeCount > 0) {
            let range = selection.getRangeAt(0);
            // Ensure range is within the editable element; if not, create a new range at the end
            const within = el.contains(range.startContainer);
            if (!within) {
              range = doc.createRange();
              range.selectNodeContents(el);
              range.collapse(false);
            }
            // Snapshot for undo
            try {
              (w as any).__ASSIST_LAST_INSERT_SNAPSHOT = {
                kind: 'ce', selector: sel, framePath: Array.isArray(path) ? path.slice(0) : [],
                htmlBefore: el.innerHTML
              };
            } catch {}
            // Insert text node
            const node = doc.createTextNode(value);
            range.deleteContents();
            range.insertNode(node);
            // Move caret to end of inserted node
            range.setStartAfter(node);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            return 'execCommand';
          }
        } catch {}
        const ok = (doc as Document).execCommand('insertText', false, value);
        try {
          // Fallback snapshot after execCommand — approximate
          (w as any).__ASSIST_LAST_INSERT_SNAPSHOT = {
            kind: 'ce', selector: sel, framePath: Array.isArray(path) ? path.slice(0) : [],
            htmlBefore: el.innerHTML
          };
        } catch {}
        return ok ? 'execCommand' : 'fail';
      }
      // Input/Textarea: insert at caret, preserve selection and dispatch input
      if ('value' in el) {
        try {
          const disabled = !!el.disabled || el.getAttribute?.('aria-disabled') === 'true';
          const ro = !!el.readOnly || el.getAttribute?.('readonly') !== null || el.getAttribute?.('aria-readonly') === 'true';
          if (disabled || ro) return 'fail';
        } catch {}
        el.focus();
        try {
          const start = typeof el.selectionStart === 'number' ? el.selectionStart : (el.value?.length || 0);
          const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : (el.value?.length || 0);
          const src = String(el.value ?? '');
          // Snapshot for undo
          try {
            (w as any).__ASSIST_LAST_INSERT_SNAPSHOT = {
              kind: 'value', selector: sel, framePath: Array.isArray(path) ? path.slice(0) : [],
              valueBefore: src, selectionStart: start, selectionEnd: end
            };
          } catch {}
          const before = src.slice(0, start);
          const after = src.slice(end);
          const next = before + value + after;
          el.value = next;
          const pos = (before + value).length;
          if (typeof el.setSelectionRange === 'function') {
            try { el.setSelectionRange(pos, pos); } catch {}
          }
          el.dispatchEvent(new (w as any).Event('input', { bubbles: true }));
          return 'value';
        } catch {
          // Fallback to replace-all behavior
          try {
            (w as any).__ASSIST_LAST_INSERT_SNAPSHOT = {
              kind: 'value', selector: sel, framePath: Array.isArray(path) ? path.slice(0) : [],
              valueBefore: String(el.value ?? ''), selectionStart: 0, selectionEnd: 0
            };
          } catch {}
          el.value = value;
          el.dispatchEvent(new (w as any).Event('input', { bubbles: true }));
          return 'value';
        }
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
  // If multiple candidates, prompt user to choose; else prefer most recent
  let tab = null as (typeof tabs[number]) | null;
  if (candidates && candidates.length > 1) {
    try {
      const list = candidates
        .slice()
        .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))
        .map((t, i) => `${i + 1}) ${t.title || '(untitled)'} — ${t.url || ''}`)
        .join('\n');
      const choiceStr = prompt(`Multiple editor windows found. Choose target by number:\n\n${list}\n\nEnter number:`);
      const idx = choiceStr ? (parseInt(choiceStr, 10) - 1) : -1;
      if (idx >= 0 && idx < candidates.length) {
        // keep same ordering used for display
        const ordered = candidates.slice().sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
        tab = ordered[idx] || null;
      }
    } catch {
      // fall through to most recent
    }
  }
  if (!tab) {
    tab = (candidates && candidates.length)
      ? candidates.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0]
      : null;
  }
  if (!tab?.id) return null;
  try {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  } catch {}
  return tab.id;
}

export async function insertUsingMapping(mapping: FieldMapping, text: string, options: InsertOptions = {}): Promise<InsertResult> {
  const tabId = await resolveTargetTabId(mapping);
  if (!tabId) return { ok: false };
  const selectors = buildSelectorList(mapping.selector, mapping.fallbackSelectors, options.preferredSelector, options.strict);
  if (!selectors.length) return { ok: false };

  const execResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: (selectors: string[], value: string, path?: number[]) => {
      let w: Window & typeof globalThis = window;
      try {
        if (Array.isArray(path) && path.length) {
          for (const i of path) { w = (w.frames[i] as any); if (!w) break; }
        }
      } catch { return { status: 'fail' as const }; }
      const doc = w?.document || document;
      let el: any = null;
      let chosen = selectors[0] || '';
      for (const s of selectors) {
        const candidate = (doc.querySelector(s) as any) || null;
        if (candidate) { el = candidate; chosen = s; break; }
      }
      if (!el) return { status: 'fail' as const };

      if (el.isContentEditable) {
        try {
          el.focus();
          const selection = (w.getSelection && w.getSelection()) || (doc as any).getSelection?.();
          if (selection && selection.rangeCount > 0) {
            let range = selection.getRangeAt(0);
            const within = el.contains(range.startContainer);
            if (!within) {
              range = doc.createRange();
              range.selectNodeContents(el);
              range.collapse(false);
            }
            try {
              (w as any).__ASSIST_LAST_INSERT_SNAPSHOT = {
                kind: 'ce', selector: chosen, framePath: Array.isArray(path) ? path.slice(0) : [],
                htmlBefore: el.innerHTML
              };
            } catch {}
            const node = doc.createTextNode(value);
            range.deleteContents();
            range.insertNode(node);
            range.setStartAfter(node);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            return { status: 'execCommand' as const, selector: chosen };
          }
        } catch {}
        const ok = (doc as Document).execCommand('insertText', false, value);
        try {
          (w as any).__ASSIST_LAST_INSERT_SNAPSHOT = {
            kind: 'ce', selector: chosen, framePath: Array.isArray(path) ? path.slice(0) : [],
            htmlBefore: el.innerHTML
          };
        } catch {}
        return ok ? { status: 'execCommand' as const, selector: chosen } : { status: 'fail' as const };
      }

      if ('value' in el) {
        try {
          const disabled = !!el.disabled || el.getAttribute?.('aria-disabled') === 'true';
          const ro = !!el.readOnly || el.getAttribute?.('readonly') !== null || el.getAttribute?.('aria-readonly') === 'true';
          if (disabled || ro) return { status: 'fail' as const };
        } catch {}
        el.focus();
        try {
          const start = typeof el.selectionStart === 'number' ? el.selectionStart : (el.value?.length || 0);
          const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : (el.value?.length || 0);
          const src = String(el.value ?? '');
          try {
            (w as any).__ASSIST_LAST_INSERT_SNAPSHOT = {
              kind: 'value', selector: chosen, framePath: Array.isArray(path) ? path.slice(0) : [],
              valueBefore: src, selectionStart: start, selectionEnd: end
            };
          } catch {}
          const before = src.slice(0, start);
          const after = src.slice(end);
          const next = before + value + after;
          el.value = next;
          const pos = (before + value).length;
          if (typeof el.setSelectionRange === 'function') {
            try { el.setSelectionRange(pos, pos); } catch {}
          }
          el.dispatchEvent(new (w as any).Event('input', { bubbles: true }));
          return { status: 'value' as const, selector: chosen };
        } catch {
          el.value = value;
          el.dispatchEvent(new (w as any).Event('input', { bubbles: true }));
          return { status: 'value' as const, selector: chosen };
        }
      }
      return { status: 'fail' as const };
    },
    args: [selectors, text, mapping.framePath]
  }).catch(() => null);

  const directResult = execResult?.[0]?.result as { status: Strategy | 'fail'; selector?: string } | undefined;
  if (directResult && directResult.status !== 'fail') {
    const selector = directResult.selector || selectors[0];
    return { ok: true, strategy: directResult.status, selector };
  }

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

  return { ok: true, strategy: 'clipboard', selector: selectors[0] };
}

// Undo last insert in the active tab using snapshot captured during insert.
export async function undoLastInsert(): Promise<boolean> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return false;
  const res = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const w: any = window as any;
      const snap = w.__ASSIST_LAST_INSERT_SNAPSHOT;
      if (!snap) return false;
      // Navigate to frame of snapshot
      let ctx: any = window;
      try {
        if (Array.isArray(snap.framePath) && snap.framePath.length) {
          for (const i of snap.framePath) { ctx = ctx.frames[i]; if (!ctx) break; }
        }
      } catch {}
      const doc = ctx?.document || document;
      const el: any = doc.querySelector(snap.selector);
      if (!el) return false;
      if (snap.kind === 'value') {
        try {
          el.focus();
          el.value = snap.valueBefore || '';
          if (typeof el.setSelectionRange === 'function') {
            const s = typeof snap.selectionStart === 'number' ? snap.selectionStart : 0;
            const e = typeof snap.selectionEnd === 'number' ? snap.selectionEnd : s;
            try { el.setSelectionRange(s, e); } catch {}
          }
          el.dispatchEvent(new (ctx as any).Event('input', { bubbles: true }));
          w.__ASSIST_LAST_INSERT_SNAPSHOT = null;
          return true;
        } catch { return false; }
      }
      if (snap.kind === 'ce') {
        try {
          el.focus();
          el.innerHTML = snap.htmlBefore || '';
          // Place caret at end
          const sel = (ctx.getSelection && ctx.getSelection()) || (doc as any).getSelection?.();
          if (sel) {
            const range = doc.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          w.__ASSIST_LAST_INSERT_SNAPSHOT = null;
          return true;
        } catch { return false; }
      }
      return false;
    }
  }).catch(() => null);
  const ok = !!(res && res[0] && res[0].result);
  return ok;
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'missing' | 'not_editable' };

export async function verifyTarget(mapping: FieldMapping, options: SelectorOptions = {}): Promise<VerifyResult> {
  const tabId = await resolveTargetTabId(mapping);
  if (!tabId) return { ok: false, reason: 'missing' };
  const selectors = buildSelectorList(mapping.selector, mapping.fallbackSelectors, options.preferredSelector, options.strict);
  if (!selectors.length) return { ok: false, reason: 'missing' };
  const res = await chrome.scripting.executeScript({
    target: { tabId },
    func: (selectors: string[], path?: number[]) => {
      let w: Window & typeof globalThis = window;
      try { if (Array.isArray(path) && path.length) { for (const i of path) { w = (w.frames[i] as any); if (!w) break; } } } catch { return { ok: false, reason: 'missing' } as any; }
      const doc = w?.document || document;
      let el: any = null;
      for (const s of selectors) { el = (doc.querySelector(s) as any) || null; if (el) break; }
      if (!el) return { ok: false, reason: 'missing' } as any;
      // Compute editability for inputs/textarea and contenteditable targets
      const isFormField = 'value' in el;
      const isCE = !!el.isContentEditable;
      if (!isFormField && !isCE) return { ok: false, reason: 'not_editable' } as any;
      // Disabled / readonly checks
      const disabled = !!el.disabled || el.getAttribute?.('aria-disabled') === 'true';
      const readonlyAttr = el.getAttribute?.('readonly') !== null || el.getAttribute?.('aria-readonly') === 'true' || !!el.readOnly;
      if (disabled || readonlyAttr) return { ok: false, reason: 'not_editable' } as any;
      return { ok: true } as any;
    },
    args: [selectors, mapping.framePath]
  }).catch(() => null);
  const out = (res && res[0] && res[0].result) as VerifyResult | undefined;
  return out || { ok: false, reason: 'missing' };
}

export async function getFieldContent(mapping: FieldMapping, options: SelectorOptions = {}): Promise<{ selector: string; content: string | null } | null> {
  const tabId = await resolveTargetTabId(mapping);
  if (!tabId) return null;
  const selectors = buildSelectorList(mapping.selector, mapping.fallbackSelectors, options.preferredSelector, options.strict);
  if (!selectors.length) return null;
  const res = await chrome.scripting.executeScript({
    target: { tabId },
    func: (selectors: string[], path?: number[]) => {
      let w: Window & typeof globalThis = window;
      try { if (Array.isArray(path) && path.length) { for (const i of path) { w = (w.frames[i] as any); if (!w) break; } } } catch { return null; }
      const doc = w?.document || document;
      for (const selector of selectors) {
        const el: any = (doc.querySelector(selector) as any) || null;
        if (!el) continue;
        if ('value' in el) {
          return { selector, content: String(el.value ?? '') };
        }
        if (el.isContentEditable) {
          const text = typeof el.innerText === 'string' ? el.innerText : (el.textContent || '');
          return { selector, content: text };
        }
        return { selector, content: null };
      }
      return null;
    },
    args: [selectors, mapping.framePath]
  }).catch(() => null);
  return (res && res[0]?.result) || null;
}

export async function listMatchingSelectors(mapping: FieldMapping, options: SelectorOptions = {}): Promise<string[]> {
  const tabId = await resolveTargetTabId(mapping);
  if (!tabId) return [];
  const selectors = buildSelectorList(mapping.selector, mapping.fallbackSelectors, options.preferredSelector, options.strict);
  if (!selectors.length) return [];
  const res = await chrome.scripting.executeScript({
    target: { tabId },
    func: (selectors: string[], path?: number[]) => {
      let w: Window & typeof globalThis = window;
      try { if (Array.isArray(path) && path.length) { for (const i of path) { w = (w.frames[i] as any); if (!w) break; } } } catch { return [] as string[]; }
      const doc = w?.document || document;
      const matches: string[] = [];
      for (const selector of selectors) {
        if (doc.querySelector(selector)) {
          matches.push(selector);
        }
      }
      return matches;
    },
    args: [selectors, mapping.framePath]
  }).catch(() => null);
  return (res && res[0]?.result) || [];
}

// Verify the insertion by checking the target field's content length against the payload length.
// Returns only lengths to avoid exposing PHI in logs.
export async function verifyInsertion(
  mapping: FieldMapping,
  selector: string,
  expectedText: string,
  options: SelectorOptions = {}
): Promise<{ ok: boolean; actualLength: number; expectedLength: number }> {
  const tabId = await resolveTargetTabId(mapping);
  if (!tabId) return { ok: false, actualLength: 0, expectedLength: expectedText.length };
  const res = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string, path?: number[]) => {
      let w: Window & typeof globalThis = window;
      try { if (Array.isArray(path) && path.length) { for (const i of path) { w = (w.frames[i] as any); if (!w) break; } } } catch { return { ok: false, len: 0 } as any; }
      const doc = w?.document || document;
      const el: any = (doc.querySelector(sel) as any) || null;
      if (!el) return { ok: false, len: 0 } as any;
      if ('value' in el) {
        try { return { ok: true, len: String(el.value ?? '').length } as any; } catch { return { ok: false, len: 0 } as any; }
      }
      if (el.isContentEditable) {
        try {
          const text = typeof el.innerText === 'string' ? el.innerText : (el.textContent || '');
          return { ok: true, len: String(text || '').length } as any;
        } catch { return { ok: false, len: 0 } as any; }
      }
      return { ok: false, len: 0 } as any;
    },
    args: [selector, mapping.framePath]
  }).catch(() => null);
  const out = (res && res[0] && (res[0].result as { ok: boolean; len: number })) || { ok: false, len: 0 };
  const expectedLength = String(expectedText || '').length;
  const actualLength = Math.max(0, Number(out.len || 0));
  // Consider success if we meet a 90% threshold to allow for formatting or normalization differences.
  const threshold = Math.floor(expectedLength * 0.9);
  const ok = out.ok && actualLength >= threshold;
  return { ok, actualLength, expectedLength };
}
