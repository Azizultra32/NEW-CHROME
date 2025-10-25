/**
 * Semantic Field Discovery for EMR Automation (Playwright)
 * Finds fields by analyzing: ARIA labels, placeholder text, labels, nearby headings,
 * role="textbox" and size/type heuristics, across same‑origin iframes.
 */

/**
 * Find a field using multiple semantic strategies across frames.
 * @param {import('playwright').Page} page
 * @param {string} sectionName e.g., 'hpi', 'assessment', 'plan'
 * @returns {Promise<{ element: import('playwright').ElementHandle, confidence: number, strategy: string }>} 
 */
export async function findField(page, sectionName) {
  const strategies = [
    { name: 'aria-label',     confidence: 0.92, fn: findByAriaLabel },
    { name: 'placeholder',    confidence: 0.88, fn: findByPlaceholder },
    { name: 'label-element',  confidence: 0.85, fn: findByLabelElement },
    { name: 'heading-prox',   confidence: 0.80, fn: findByHeadingProximity },
    { name: 'role-textbox',   confidence: 0.78, fn: findByRoleTextbox },
    { name: 'textarea-large', confidence: 0.70, fn: findByTextareaFallback }
  ];

  for (const strategy of strategies) {
    try {
      const el = await runAcrossFrames(page, (frame) => strategy.fn(frame, sectionName));
      if (el) {
        return { element: el, confidence: strategy.confidence, strategy: strategy.name };
      }
    } catch {}
  }

  throw new Error(`No field found for section: ${sectionName}`);
}

// ────────────────────────────────────────────────────────────────────────────────
// Strategies (frame‑scoped)

async function findByAriaLabel(frame, sectionName) {
  const patterns = getPatterns(sectionName);
  for (const p of patterns) {
    const sel = `[aria-label*="${p}" i], [aria-labelledby*="${p}" i]`;
    const el = await frame.$(sel);
    if (el && await isEditable(el)) return el;
  }
  return null;
}

async function findByPlaceholder(frame, sectionName) {
  const patterns = getPatterns(sectionName);
  for (const p of patterns) {
    const sel = `input[placeholder*="${p}" i], textarea[placeholder*="${p}" i]`;
    const el = await frame.$(sel);
    if (el && await isEditable(el)) return el;
  }
  return null;
}

async function findByLabelElement(frame, sectionName) {
  const patterns = getPatterns(sectionName);
  const handle = await frame.evaluateHandle(({ patterns }) => {
    const labels = Array.from(document.querySelectorAll('label'));
    for (const label of labels) {
      const text = (label.textContent || '').toLowerCase();
      for (const pat of patterns) {
        if (text.includes(String(pat).toLowerCase())) {
          const id = label.getAttribute('for');
          if (id) {
            const t = document.getElementById(id);
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
              return t;
            }
          }
          const nested = label.querySelector('input, textarea, [contenteditable="true"]');
          if (nested) return nested;
        }
      }
    }
    return null;
  }, { patterns });
  const el = handle.asElement();
  if (el && await isEditable(el)) return el;
  try { await handle.dispose(); } catch {}
  return null;
}

async function findByHeadingProximity(frame, sectionName) {
  const patterns = getPatterns(sectionName);
  const handle = await frame.evaluateHandle(({ patterns }) => {
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,[class*="heading"],[class*="label"]'));
    for (const heading of headings) {
      const text = (heading.textContent || '').toLowerCase();
      for (const pat of patterns) {
        if (text.includes(String(pat).toLowerCase())) {
          let n = heading.nextElementSibling;
          let depth = 0;
          while (n && depth < 6) {
            // direct match
            if (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable) return n;
            // descendants
            const k = n.querySelector?.('input, textarea, [contenteditable="true"]');
            if (k) return k;
            n = n.nextElementSibling;
            depth++;
          }
        }
      }
    }
    return null;
  }, { patterns });
  const el = handle.asElement();
  if (el && await isEditable(el)) return el;
  try { await handle.dispose(); } catch {}
  return null;
}

async function findByRoleTextbox(frame) {
  // Prefer a labeled textbox
  const labeled = await frame.$('[role="textbox"][aria-label]');
  if (labeled && await isEditable(labeled)) return labeled;
  // Any rich editor
  const any = await frame.$('[role="textbox"], [contenteditable="true"]');
  if (any && await isEditable(any)) return any;
  return null;
}

async function findByTextareaFallback(frame, sectionName) {
  const largeSections = ['hpi', 'assessment', 'plan', 'physical_exam', 'history'];
  if (!largeSections.includes(normalize(sectionName))) return null;
  const handle = await frame.evaluateHandle(() => {
    const nodes = Array.from(document.querySelectorAll('textarea, [contenteditable="true"]'));
    let best = null;
    let bestScore = 0;
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const visible = r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none';
      if (!visible) continue;
      const score = r.width * r.height;
      if (score > bestScore && r.width > 200 && r.height > 100) { best = el; bestScore = score; }
    }
    return best;
  });
  const el = handle.asElement();
  if (el && await isEditable(el)) return el;
  try { await handle.dispose(); } catch {}
  return null;
}

// ────────────────────────────────────────────────────────────────────────────────
// Helpers

async function isEditable(element) {
  return await element.evaluate((el) => {
    const editable = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    if (!editable) return false;
    const disabled = el.disabled || el.getAttribute?.('aria-disabled') === 'true';
    const readonly = el.readOnly || el.getAttribute?.('readonly') !== null || el.getAttribute?.('aria-readonly') === 'true';
    if (disabled || readonly) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const visible = rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none';
    return visible;
  });
}

function normalize(s) { return String(s || '').toLowerCase().trim(); }

function getPatterns(sectionName) {
  const key = normalize(sectionName);
  const map = {
    chief_complaint: ['chief complaint', 'cc', 'presenting complaint', 'reason for visit'],
    hpi: ['history of present illness', 'hpi', 'present illness', 'history present', 'subjective'],
    ros: ['review of systems', 'ros', 'systems review'],
    physical_exam: ['physical exam', 'physical examination', 'exam', 'pe', 'objective'],
    assessment: ['assessment', 'diagnosis', 'impression'],
    plan: ['plan', 'treatment plan', 'clinical plan'],
    orders: ['orders', 'clinical orders', 'lab orders'],
    medications: ['medications', 'meds', 'prescriptions', 'drugs'],
    followup: ['follow up', 'follow-up', 'next visit']
  };
  return map[key] || [key];
}

/**
 * Run a strategy across main frame + same‑origin child frames.
 * Returns first ElementHandle found.
 */
async function runAcrossFrames(page, fn) {
  // main frame first
  try { const el = await fn(page.mainFrame()); if (el) return el; } catch {}
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    try { const el = await fn(frame); if (el) return el; } catch {}
  }
  return null;
}

/**
 * Collect all editable fields across frames for diagnostics/UI.
 * @param {import('playwright').Page} page
 * @returns {Promise<Array<{ frameUrl: string, fields: Array<{tagName:string,type:string,ariaLabel:string,placeholder:string,id:string,name:string,rect:{x:number,y:number,width:number,height:number}}>}>>}
 */
export async function getAllFields(page) {
  const out = [];
  for (const frame of [page.mainFrame(), ...page.frames().filter(f => f !== page.mainFrame())]) {
    try {
      const fields = await frame.evaluate(() => {
        const out = [];
        const nodes = document.querySelectorAll('input, textarea, [contenteditable="true"]');
        nodes.forEach((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const visible = r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none';
          if (!visible) return;
          out.push({
            tagName: el.tagName,
            type: el.type || (el.isContentEditable ? 'contenteditable' : 'unknown'),
            ariaLabel: el.getAttribute('aria-label') || '',
            placeholder: el.getAttribute?.('placeholder') || '',
            id: el.id || '',
            name: el.name || '',
            rect: { x: r.x, y: r.y, width: r.width, height: r.height }
          });
        });
        return out;
      });
      out.push({ frameUrl: frame.url(), fields });
    } catch {}
  }
  return out;
}
