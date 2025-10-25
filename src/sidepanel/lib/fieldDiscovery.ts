import type { Section } from './mapping';

// Lightweight semantic discovery helpers executed in the page context via chrome.scripting

export type DiscoveryCandidate = { selector: string; confidence: number; framePath?: number[] };

const SECTION_HINTS: Record<string, { labels: string[]; placeholders: string[]; headings: string[] }> = {
  PLAN: {
    labels: ['plan', 'treatment plan', 'management'],
    placeholders: ['plan', 'treatment'],
    headings: ['plan']
  },
  HPI: {
    labels: ['hpi', 'history of present illness', 'subjective'],
    placeholders: ['hpi', 'history'],
    headings: ['history of present illness', 'subjective']
  },
  ROS: {
    labels: ['ros', 'review of systems'],
    placeholders: ['ros', 'review of systems'],
    headings: ['review of systems']
  },
  EXAM: {
    labels: ['exam', 'physical exam', 'objective'],
    placeholders: ['exam', 'objective'],
    headings: ['physical exam', 'objective']
  }
};

async function runInPage<T>(func: (...args: any[]) => T, args: any[] = []): Promise<T | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return null;
  const res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args }).catch(() => null);
  return (res && res[0] && (res[0].result as T)) || null;
}

export async function discoverCandidatesForSection(section: Section): Promise<DiscoveryCandidate[]> {
  const hints = SECTION_HINTS[section] || SECTION_HINTS.PLAN;
  const { labels, placeholders, headings } = hints;
  const lc = (s: string) => s.toLowerCase();

  // Execute discovery in page
  const found = await runInPage((labels: string[], placeholders: string[], headings: string[]) => {
    type Found = { selector: string; framePath?: number[] };
    const out: Found[] = [];
    const contains = (a: string, b: string) => a.toLowerCase().includes(b.toLowerCase());

    function tryPush(sel: string, win: Window, path?: number[]) {
      try { if (win.document && win.document.querySelector(sel)) out.push({ selector: sel, framePath: (path && path.length) ? path.slice(0) : undefined }); } catch {}
    }

    function scanWindow(win: Window, path: number[] = [], depth: number = 0) {
      const doc = win.document;
      if (!doc) return;

      // ARIA label / label[for]
      for (const hint of labels) {
        tryPush(`textarea[aria-label*="${hint}"]`, win, path);
        tryPush(`input[aria-label*="${hint}"]`, win, path);
        tryPush(`[contenteditable="true"][aria-label*="${hint}"]`, win, path);
        tryPush(`[role="textbox"][aria-label*="${hint}"]`, win, path);
        const labs = Array.from(doc.querySelectorAll('label')) as HTMLLabelElement[];
        for (const lab of labs) {
          const txt = lab.textContent || '';
          if (contains(txt, hint)) {
            const id = lab.getAttribute('for');
            if (id) tryPush(`#${CSS.escape(id)}`, win, path);
          }
        }
      }

      // Placeholders
      for (const hint of placeholders) {
        tryPush(`textarea[placeholder*="${hint}"]`, win, path);
        tryPush(`input[placeholder*="${hint}"]`, win, path);
        tryPush(`[role="textbox"][placeholder*="${hint}"]`, win, path);
      }

      // Headings proximity: find nearest editable under same container
      const editableSelector = 'textarea, input, [contenteditable="true"], [role="textbox"]';
      const nodes = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, label, legend')) as HTMLElement[];
      for (const node of nodes) {
        const text = node.textContent || '';
        for (const hd of headings) {
          if (!contains(text, hd)) continue;
          const root: HTMLElement = (node.closest && node.closest('section, form, fieldset, div')) || (doc.body as any);
          const cand = root ? (root.querySelector(editableSelector) as HTMLElement | null) : null;
          if (cand) {
            if (cand.id) tryPush(`#${CSS.escape(cand.id)}`, win, path);
            else if (cand.hasAttribute('name')) tryPush(`${cand.tagName.toLowerCase()}[name="${cand.getAttribute('name')}"]`, win, path);
            else if ((cand as any).isContentEditable) tryPush('[contenteditable="true"]', win, path);
          }
        }
      }

      // Generic role/contenteditable as last resort
      tryPush('[role="textbox"]', win, path);
      tryPush('[contenteditable="true"]', win, path);
      // Size heuristics: large textareas likely note editors
      const tas = Array.from(doc.querySelectorAll('textarea')) as HTMLTextAreaElement[];
      for (const ta of tas) {
        const rows = parseInt(ta.getAttribute('rows') || '0');
        const rect = ta.getBoundingClientRect();
        if (rows >= 6 || rect.height >= 120) {
          if (ta.id) tryPush(`#${CSS.escape(ta.id)}`, win, path);
          else if ((ta as any).name) tryPush(`textarea[name="${(ta as any).name}"]`, win, path);
          else tryPush('textarea', win, path);
        }
      }

      // Traverse iframes (same-origin), depth limit 2
      if (depth < 2) {
        const ifrs = Array.from(doc.querySelectorAll('iframe')) as HTMLIFrameElement[];
        for (const ifr of ifrs) {
          try {
            const cw = ifr.contentWindow as Window | null;
            if (!cw) continue;
            let idx = -1;
            for (let i = 0; i < (win.frames?.length || 0); i++) { try { if (win.frames[i] === cw) { idx = i; break; } } catch {}
            }
            if (idx === -1) continue;
            scanWindow(cw, path.concat(idx), depth + 1);
          } catch {}
        }
      }
    }

    scanWindow(window, [], 0);
    return out;
  }, [labels, placeholders, headings]);

  const selectors = (Array.isArray(found) ? found : []) as Array<{ selector: string; framePath?: number[] }>;
  const scored: DiscoveryCandidate[] = selectors.map((entry) => {
    // naive scoring: aria/label gets 0.86, placeholder 0.84, heading 0.82, generic 0.78
    const s = entry.selector.toLowerCase();
    let score = 0.78;
    if (s.includes('aria-label') || s.startsWith('#') || s.includes('[name=')) score = 0.86;
    else if (s.includes('placeholder')) score = 0.84;
    else if (s.includes('contenteditable') || s.includes('[role="textbox"]')) score = 0.82;
    return { selector: entry.selector, confidence: score, framePath: entry.framePath };
  });

  // De-dup and sort by confidence
  const seen = new Set<string>();
  const unique = scored.filter((c) => {
    const key = (c.framePath && c.framePath.length ? c.framePath.join('.') + '|' : '') + c.selector;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => b.confidence - a.confidence);
  return unique.slice(0, 8);
}
