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
      // ContentEditable: prefer Range insertion, fallback to execCommand
      if (el.isContentEditable) {
        try {
          el.focus();
          const sel = (w.getSelection && w.getSelection()) || (doc as any).getSelection?.();
          if (sel && sel.rangeCount > 0) {
            let range = sel.getRangeAt(0);
            // Ensure range is within the editable element; if not, create a new range at the end
            const within = el.contains(range.startContainer);
            if (!within) {
              range = doc.createRange();
              range.selectNodeContents(el);
              range.collapse(false);
            }
            // Insert text node
            const node = doc.createTextNode(value);
            range.deleteContents();
            range.insertNode(node);
            // Move caret to end of inserted node
            range.setStartAfter(node);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return 'execCommand';
          }
        } catch {}
        const ok = (doc as Document).execCommand('insertText', false, value);
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
      // ContentEditable: prefer Range insertion, fallback to execCommand
      if (el.isContentEditable) {
        try {
          el.focus();
          const sel = (w.getSelection && w.getSelection()) || (doc as any).getSelection?.();
          if (sel && sel.rangeCount > 0) {
            let range = sel.getRangeAt(0);
            const within = el.contains(range.startContainer);
            if (!within) {
              range = doc.createRange();
              range.selectNodeContents(el);
              range.collapse(false);
            }
            const node = doc.createTextNode(value);
            range.deleteContents();
            range.insertNode(node);
            range.setStartAfter(node);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return 'execCommand';
          }
        } catch {}
        const ok = (doc as Document).execCommand('insertText', false, value);
        return ok ? 'execCommand' : 'fail';
      }
      // Input/Textarea: caret-aware insertion
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
          el.value = value;
          el.dispatchEvent(new (w as any).Event('input', { bubbles: true }));
          return 'value';
        }
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
    args: [mapping.selector, mapping.framePath]
  }).catch(() => null);
  const out = (res && res[0] && res[0].result) as VerifyResult | undefined;
  return out || { ok: false, reason: 'missing' };
}
