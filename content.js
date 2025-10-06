(function(){
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
    console.warn('[AssistMD] content.js: runtime unavailable, skipping init');
    return;
  }

  // Silence console in production contexts to reduce PHI risk
  try {
    if (!(window).__ASSIST_DEBUG) {
      console.log = () => {};
      console.warn = () => {};
    }
  } catch {}

  function extAlive() {
    try { return !!chrome?.runtime?.id; } catch { return false; }
  }

  function safeSend(payload) {
    if (!extAlive()) return;
    try {
      const p = chrome.runtime.sendMessage(payload);
      if (p?.catch) p.catch(() => {});
    } catch (_) {}
  }
  function getText(sel){ const el = document.querySelector(sel); return el ? (el.textContent||'').trim() : ''; }
  function stdDob(s){ const m = s.match(/\b(19|20)\d{2}[-\/](0[1-9]|1[0-2])[-\/](0[1-9]|[12]\d|3[01])\b/); return m?m[0]:''; }

  function heuristics() {
    const t = document.body?.innerText || '';
    const name = (t.match(/\bName[:\s]+([A-Z][A-Za-z' -]+(?:, [A-Z][A-Za-z' -]+)?)/i)||[])[1] || '';
    const dob  = stdDob(t) || (t.match(/\bDOB[:\s]+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i)||[])[1] || '';
    const mrn  = (t.match(/\b(MRN|PHN|Chart\s*(No|#))[:\s]+([A-Z0-9-]+)/i)||[])[3] || '';
    return { name, dob, mrn };
  }

  function fingerprint(d) {
    const last = (d.name||'').split(/[ ,]/).filter(Boolean).pop()||'';
    const first= (d.name||'').split(/[ ,]/)[0]||'';
    const raw = `${last.toUpperCase()},${first.toUpperCase()}|${d.dob}|${(d.mrn||'').slice(-4)}`;
    let h=0; for (let i=0;i<raw.length;i++) h=(h*31 + raw.charCodeAt(i))|0;
    return { fp: String(h), preview: `${first?.[0]||''}. ${last} · ${d.dob||'—'} · MRN••${(d.mrn||'').slice(-2)}` };
  }

  let __assist_fp_last_sent = 0;
  let __assist_fp_last_val = '';
  function post() {
    const now = Date.now();
    // Max-frequency guard: avoid sending more than once per 1200ms
    if (now - __assist_fp_last_sent < 1200) return;
    const demo = heuristics();
    const { fp, preview } = fingerprint(demo);
    // Skip identical fingerprint spam within a short TTL (5s)
    if (fp && fp === __assist_fp_last_val && (now - __assist_fp_last_sent) < 5000) return;
    __assist_fp_last_val = fp;
    __assist_fp_last_sent = now;
    safeSend({ type:'EHR_DEMOGRAPHICS', demo, fp, preview });
  }

  // Debounce demographics posts to avoid flooding on dynamic pages
  let __assist_fp_timer = null;
  function schedulePost() {
    try { if (__assist_fp_timer) clearTimeout(__assist_fp_timer); } catch {}
    __assist_fp_timer = setTimeout(() => { try { post(); } catch {} }, 300);
  }
  const mo = new MutationObserver(() => { schedulePost(); });
  mo.observe(document.documentElement, { subtree:true, childList:true, characterData:true });
  schedulePost();

  // Mapping overlay -------------------------------------------------
  let mapping = false; let currentSection = 'PLAN';
  function overlay() {
    let o = document.getElementById('__assist_map_overlay');
    if (!o) {
      o = document.createElement('div'); o.id='__assist_map_overlay';
      Object.assign(o.style, { position:'fixed', inset:'0', background:'rgba(2,6,23,0.15)', zIndex:'2147483647', display:'none', cursor:'crosshair' });
      document.documentElement.appendChild(o);
      o.addEventListener('click', (e)=>{
        if (!mapping) return;
        e.preventDefault(); e.stopPropagation();
        // Temporarily hide overlay to hit-test underlying element
        const prev = o.style.display;
        o.style.display = 'none';
        const picked = pickAtPoint(window, e.clientX, e.clientY);
        o.style.display = prev || 'block';
        if (!picked) return;
        const { selector, framePath } = picked;
        const href = location && location.href || '';
        const title = document && document.title || '';
        const isPopup = (window === window.top) && !!window.opener;
        safeSend({ type:'MAP_PICK', section: currentSection, selector, framePath, href, title, isPopup });
        toggle(false);
      }, true);
    }
    return o;
  }
  function toggle(on, section='PLAN') { currentSection=section; mapping=on; overlay().style.display = on?'block':'none'; }
  function computeSelector(el){
    if (!el) return '';
    if (el.id) return `#${CSS.escape(el.id)}`;
    for (const attr of (el.attributes||[])) {
      if (attr.name.startsWith('data-')) return `${el.tagName.toLowerCase()}[${attr.name}="${attr.value}"]`;
    }
    const cls = (el.className||'').toString().trim().split(/\s+/).filter(Boolean).slice(0,3).join('.');
    return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
  }

  // Traverse same-origin iframe chain at a point to compute selector + framePath
  function pickAtPoint(rootWindow, clientX, clientY){
    /** @type {number[]} */
    const path = [];
    let w = rootWindow;
    let x = clientX;
    let y = clientY;
    try {
      while (true) {
        const el = w.document.elementFromPoint(x, y);
        if (!el) return null;
        if (el.tagName === 'IFRAME') {
          // Only traverse same-origin frames
          const ifr = /** @type {HTMLIFrameElement} */ (el);
          let cw;
          try { cw = ifr.contentWindow; } catch { break; }
          if (!cw) break;
          // Find index of this frame in parent frames
          let idx = -1;
          for (let i = 0; i < w.frames.length; i++) {
            if (w.frames[i] === cw) { idx = i; break; }
          }
          if (idx === -1) break;
          path.push(idx);
          const r = ifr.getBoundingClientRect();
          x = x - r.left;
          y = y - r.top;
          w = cw;
          continue;
        }
        // Found target element in current window
        const selector = computeSelector(el);
        return { selector, framePath: path.slice(0) };
      }
    } catch {}
    // Fallback to top-level element under point
    const el = rootWindow.document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    return { selector: computeSelector(el), framePath: [] };
  }
  chrome.runtime.onMessage.addListener((m)=>{
    if (!extAlive()) return;
    if (m?.type==='MAP_MODE') toggle(!!m.on, m.section||'PLAN');
    // Lightweight HUD indicator for short-lived states (e.g., command mode)
    if (m?.type === 'COMMAND_WINDOW') {
      try { showHudBadge(m.text || 'Command mode', m.ms || 1200); } catch {}
    }
    if (m?.type === 'INSERT_TEXT') {
      const el = document.activeElement;
      if (!el) return;
      if (el instanceof HTMLElement && el.isContentEditable) {
        try { document.execCommand('insertText', false, m.text); } catch {}
        return;
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        const value = el.value;
        const insert = String(m.text ?? '');
        el.value = value.slice(0, start) + insert + value.slice(end);
        const pos = start + insert.length;
        try {
          el.setSelectionRange(pos, pos);
        } catch {}
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });

  // Ghost preview overlay -------------------------------------------------
  let __assistGhostRoot = null;
  let __assistGhostNodes = [];
  let __assistGhostLast = null; // { sections }
  let __assistGhostRenderTimer = null;
  let __assistGhostRedacted = false; // Hide text content in ghost overlay when true

  function ensureGhostRoot() {
    if (__assistGhostRoot && document.body.contains(__assistGhostRoot)) return __assistGhostRoot;
    const r = document.createElement('div');
    r.id = '__assist_ghost_overlay';
    Object.assign(r.style, {
      position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 2147483647,
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    });
    document.documentElement.appendChild(r);
    __assistGhostRoot = r;
    return r;
  }

  function clearGhostOverlay() {
    try { if (__assistGhostRenderTimer) clearTimeout(__assistGhostRenderTimer); } catch {}
    __assistGhostRenderTimer = null;
    const root = __assistGhostRoot;
    if (!root) return;
    for (const n of __assistGhostNodes) { try { n.remove(); } catch {} }
    __assistGhostNodes = [];
  }

  // HUD badge -------------------------------------------------------------
  let __assistHudRoot = null;
  let __assistHudTimer = null;
  function ensureHudRoot() {
    if (__assistHudRoot && document.body.contains(__assistHudRoot)) return __assistHudRoot;
    const r = document.createElement('div');
    r.id = '__assist_hud';
    Object.assign(r.style, {
      position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 2147483647, pointerEvents: 'none', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    });
    document.documentElement.appendChild(r);
    __assistHudRoot = r;
    return r;
  }
  function showHudBadge(text, ttlMs) {
    const root = ensureHudRoot();
    const badge = document.createElement('div');
    Object.assign(badge.style, {
      display: 'inline-block', padding: '6px 10px', borderRadius: '999px',
      background: 'rgba(31,41,55,0.85)', color: 'white', fontSize: '12px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)', backdropFilter: 'blur(4px)',
      transition: 'opacity 160ms ease', opacity: '0.98'
    });
    badge.textContent = String(text || '');
    // Clear prior badge quickly
    try { if (__assistHudTimer) clearTimeout(__assistHudTimer); } catch {}
    root.innerHTML = '';
    root.appendChild(badge);
    __assistHudTimer = setTimeout(() => { try { badge.remove(); } catch {} }, Math.max(300, ttlMs|0));
  }

  function getFrameChain(path) {
    // Returns array of iframe elements along the path
    const chain = [];
    let ctx = window;
    for (const idx of Array.isArray(path) ? path : []) {
      let found = null;
      const ifrs = Array.from(ctx.document.querySelectorAll('iframe'));
      for (const el of ifrs) { try { if (el.contentWindow === ctx.frames[idx]) { found = el; break; } } catch {} }
      if (!found) break;
      chain.push(found);
      ctx = ctx.frames[idx];
    }
    return chain;
  }

  function resolveMappedElement(selector, framePath) {
    let w = window;
    try {
      if (Array.isArray(framePath) && framePath.length) {
        for (const i of framePath) { w = w.frames[i]; if (!w) break; }
      }
    } catch { return null; }
    try { return (w.document && w.document.querySelector(selector)) || null; } catch { return null; }
  }

  // Helper to adjust color brightness
  function adjustColor(color, amount) {
    const hex = color.replace('#', '');
    const num = parseInt(hex, 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
    const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
  }

  function drawGhostFor(el, label, text, framePath, badgeColor, confidence = 0.90) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let offX = 0, offY = 0;
    // accumulate offsets for iframe chain
    const chain = getFrameChain(framePath);
    for (const ifr of chain) {
      const r = ifr.getBoundingClientRect();
      offX += r.left;
      offY += r.top;
    }
    const root = ensureGhostRoot();
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'absolute', left: (rect.left + offX) + 'px', top: (rect.top + offY) + 'px',
      width: Math.max(0, rect.width) + 'px', height: Math.max(0, rect.height) + 'px',
      border: '2px dashed rgba(99,102,241,0.95)', borderRadius: '16px',
      background: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
      backdropFilter: 'blur(6px)',
      boxShadow: '0 8px 32px rgba(99,102,241,0.2), inset 0 1px 1px rgba(255,255,255,0.3)',
      color: '#1e293b', fontSize: '13px', fontWeight: '500', lineHeight: '1.4',
      padding: '8px 10px', overflow: 'hidden',
      transition: 'all 0.2s ease-in-out',
      userSelect: 'none', pointerEvents: 'none',
      opacity: '0', transform: 'scale(0.95)'
    });
    const preview = String(text || '').slice(0, 400);
    const truncated = preview.length < text.length;
    const display = __assistGhostRedacted ? '[redacted preview]' : (truncated ? preview + '...' : preview);
    box.textContent = display;

    // Add character count if long text
    if (text.length > 100) {
      const charCount = document.createElement('div');
      Object.assign(charCount.style, {
        position: 'absolute', bottom: '4px', right: '6px',
        fontSize: '9px', padding: '2px 4px',
        background: 'rgba(0,0,0,0.6)', color: '#fff',
        borderRadius: '4px', fontWeight: '600'
      });
      charCount.textContent = `${text.length} chars`;
      box.appendChild(charCount);
    }

    const badge = document.createElement('div');
    const isLowConfidence = confidence < 0.80;
    const badgeBg = isLowConfidence ? '#ef4444' : (badgeColor || '#6366f1');
    const badgeDark = adjustColor(badgeBg, -20);

    Object.assign(badge.style, {
      position: 'absolute', left: (rect.left + offX) + 'px', top: Math.max(0, (rect.top + offY) - 24) + 'px',
      fontSize: '11px', fontWeight: '600', letterSpacing: '0.02em', padding: '4px 10px',
      background: `linear-gradient(135deg, ${badgeBg}, ${badgeDark})`,
      color: '#fff', borderRadius: '999px',
      boxShadow: isLowConfidence
        ? '0 4px 16px rgba(239,68,68,0.45), 0 2px 8px rgba(0,0,0,0.15)'
        : '0 4px 16px rgba(99,102,241,0.45), 0 2px 8px rgba(0,0,0,0.15)',
      border: '1px solid rgba(255,255,255,0.3)',
      transition: 'transform 0.2s ease-in-out',
      userSelect: 'none', pointerEvents: 'none',
      opacity: '0', transform: 'scale(0.95)'
    });

    // Add confidence score to badge
    badge.textContent = `${label} ${Math.round(confidence * 100)}%`;

    // Add pulse animation for low confidence
    if (isLowConfidence) {
      // Inject keyframe animation (only once)
      if (!document.getElementById('__assist_ghost_styles')) {
        const style = document.createElement('style');
        style.id = '__assist_ghost_styles';
        style.textContent = `
          @keyframes pulse-warning {
            0%, 100% {
              box-shadow: 0 4px 16px rgba(239,68,68,0.45), 0 2px 8px rgba(0,0,0,0.15);
              transform: scale(1);
            }
            50% {
              box-shadow: 0 4px 24px rgba(239,68,68,0.65), 0 2px 12px rgba(0,0,0,0.25);
              transform: scale(1.05);
            }
          }
        `;
        document.head.appendChild(style);
      }
      badge.style.animation = 'pulse-warning 2s ease-in-out infinite';
    }

    root.appendChild(box); root.appendChild(badge);
    __assistGhostNodes.push(box, badge);

    // Staggered fade-in animation
    const index = __assistGhostNodes.length / 2;
    setTimeout(() => {
      box.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
      box.style.opacity = '1';
      box.style.transform = 'scale(1)';
      badge.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
      badge.style.opacity = '1';
      badge.style.transform = 'scale(1)';
    }, index * 50);
  }

  async function renderGhostPreview(sections) {
    clearGhostOverlay();
    __assistGhostLast = { sections };
    const host = location.hostname;
    const key = `MAP_${host}`;
    let profile = null;
    try { const bag = await chrome.storage.local.get([key]); profile = bag[key] || null; } catch {}
    if (!profile) return;
    const labels = { PLAN: 'Plan', HPI: 'HPI', ROS: 'ROS', EXAM: 'Exam' };
    const colors = { PLAN: '#10b981', HPI: '#6366f1', ROS: '#d97706', EXAM: '#ef4444' };
    for (const k of ['PLAN','HPI','ROS','EXAM']) {
      const text = sections && sections[k];
      const mapping = profile && profile[k];
      if (!text || !mapping || !mapping.selector) continue;
      const el = resolveMappedElement(mapping.selector, mapping.framePath);
      if (!el) continue;
      const confidence = mapping.confidence || 0.90;
      drawGhostFor(el, labels[k], text, mapping.framePath, colors[k], confidence);
    }
    // re-render on viewport changes briefly to keep alignment sensible
    const schedule = () => {
      try { if (__assistGhostRenderTimer) clearTimeout(__assistGhostRenderTimer); } catch {}
      __assistGhostRenderTimer = setTimeout(() => { if (__assistGhostLast) renderGhostPreview(__assistGhostLast.sections); }, 120);
    };
    window.addEventListener('scroll', schedule, { passive: true, once: true });
    window.addEventListener('resize', schedule, { passive: true, once: true });
  }

  chrome.runtime.onMessage.addListener((m) => {
    if (!extAlive()) return;
    if (m?.type === 'GHOST_PREVIEW' && m.sections) {
      renderGhostPreview(m.sections);
    }
    if (m?.type === 'GHOST_CLEAR') {
      clearGhostOverlay();
      __assistGhostLast = null;
    }
    if (m?.type === 'GHOST_SET_REDACTED') {
      __assistGhostRedacted = !!m.on;
      if (__assistGhostLast && __assistGhostLast.sections) {
        renderGhostPreview(__assistGhostLast.sections);
      }
    }
  });

  // Hotkeys: Alt+G to request preview, Alt+Enter to execute, Esc to clear
  window.addEventListener('keydown', (e) => {
    try {
      const mac = navigator.platform.toUpperCase().includes('MAC');
      if (e.altKey && (e.key === 'g' || e.key === 'G')) {
        chrome.runtime.sendMessage({ type: 'REQUEST_GHOST_PREVIEW' }).catch(() => {});
      } else if (e.altKey && e.key === 'Enter') {
        chrome.runtime.sendMessage({ type: 'REQUEST_EXECUTE_INSERT' }).catch(() => {});
      } else if (e.altKey && (e.key === 'r' || e.key === 'R')) {
        // Toggle redacted overlay mode
        __assistGhostRedacted = !__assistGhostRedacted;
        if (__assistGhostLast && __assistGhostLast.sections) {
          renderGhostPreview(__assistGhostLast.sections);
        }
      } else if (e.key === 'Escape') {
        clearGhostOverlay();
        __assistGhostLast = null;
      }
    } catch {}
  }, true);
})();

// Pairing dock ---------------------------------------------------------------
(function(){
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
  const DOCK_ID = '__assist_pairing_dock';
  const doc = document;
  let dock, header, status, btn, dot;
  const state = { enabled: false, pairs: [], busy: false };
  let listenerAttached = false;

  function ensureDock() {
    if (!doc.body) return false;
    if (dock && doc.body.contains(dock)) return true;
    const existing = doc.getElementById(DOCK_ID);
    if (existing) {
      dock = existing;
      header = dock.querySelector('[data-assist-header]');
      status = dock.querySelector('[data-assist-status]');
      btn = dock.querySelector('[data-assist-toggle]');
      dot = dock.querySelector('[data-assist-dot]');
      return !!btn && !!status && !!dot;
    }
    dock = doc.createElement('div');
    dock.id = DOCK_ID;
    Object.assign(dock.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 2147483646,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '11px',
      color: '#ffffff',
      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      border: '1px solid rgba(139,92,246,0.3)',
      borderRadius: '10px',
      boxShadow: '0 8px 32px rgba(99,102,241,0.35)',
      padding: '8px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      minWidth: '160px'
    });
    header = doc.createElement('div');
    header.setAttribute('data-assist-header', '1');
    header.textContent = 'AssistMD';
    Object.assign(header.style, {
      fontWeight: '600',
      fontSize: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      color: '#ffffff'
    });
    dot = doc.createElement('span');
    dot.setAttribute('data-assist-dot', '1');
    Object.assign(dot.style, {
      display: 'inline-block',
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: '#ffffff'
    });
    header.appendChild(dot);
    status = doc.createElement('div');
    status.setAttribute('data-assist-status', '1');
    Object.assign(status.style, {
      fontSize: '11px',
      color: 'rgba(255,255,255,0.9)',
      lineHeight: '1.3'
    });
    btn = doc.createElement('button');
    btn.setAttribute('data-assist-toggle', '1');
    btn.setAttribute('aria-label', 'Toggle pairing');
    btn.type = 'button';
    btn.textContent = 'Pairing Off';
    Object.assign(btn.style, {
      fontSize: '11px',
      padding: '6px 10px',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.3)',
      background: 'rgba(255,255,255,0.2)',
      color: '#ffffff',
      cursor: 'pointer',
      backdropFilter: 'blur(10px)'
    });
    btn.addEventListener('mouseenter', () => { 
      btn.style.background = 'rgba(255,255,255,0.3)';
      btn.style.borderColor = 'rgba(255,255,255,0.5)';
    });
    btn.addEventListener('mouseleave', () => { 
      btn.style.background = 'rgba(255,255,255,0.2)';
      btn.style.borderColor = 'rgba(255,255,255,0.3)';
    });
    dock.appendChild(header);
    dock.appendChild(status);
    dock.appendChild(btn);
    doc.body.appendChild(dock);
    return true;
  }

  function render() {
    if (!btn || !status || !dot) return;
    btn.textContent = state.enabled ? (state.busy ? 'Pairing…' : 'Pairing On') : (state.busy ? 'Pairing…' : 'Pairing Off');
    btn.disabled = state.busy;
    btn.style.background = state.enabled ? '#10b981' : 'rgba(255,255,255,0.2)';
    btn.style.color = '#ffffff';
    dot.style.background = state.enabled ? '#10b981' : '#ffffff';
    if (!state.enabled) {
      status.textContent = 'Pairing disabled';
    } else if (state.pairs.length) {
      const primary = state.pairs[0];
      status.textContent = `Magnetized: ${primary.host || primary.title || 'window'}`;
    } else {
      status.textContent = 'Waiting for eligible host window';
    }
  }

  function updateFromPayload(payload) {
    if (!payload) return;
    state.enabled = !!payload.enabled;
    state.pairs = Array.isArray(payload.pairs) ? payload.pairs : [];
    render();
  }

  function attachListeners() {
    if (listenerAttached || !btn) return;
    listenerAttached = true;
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'WINDOW_PAIR_STATUS_EVENT') {
        updateFromPayload(message);
      }
    });
    btn.addEventListener('click', async () => {
      if (state.busy) return;
      state.busy = true;
      render();
      try {
        const res = await chrome.runtime.sendMessage({ type: 'WINDOW_PAIR_SET', enabled: !state.enabled });
        if (res && res.ok !== false) {
          state.enabled = typeof res.enabled === 'boolean' ? res.enabled : !state.enabled;
        }
      } catch {}
      state.busy = false;
      render();
    });
    chrome.runtime.sendMessage({ type: 'WINDOW_PAIR_STATUS' }).then(updateFromPayload).catch(() => {});
  }

  function initDock() {
    if (!ensureDock()) return false;
    render();
    attachListeners();
    return true;
  }

  if (!initDock()) {
    doc.addEventListener('DOMContentLoaded', () => { initDock(); }, { once: true });
  }
})();
