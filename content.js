(function(){
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
    console.warn('[AssistMD] content.js: runtime unavailable, skipping init');
    return;
  }

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

