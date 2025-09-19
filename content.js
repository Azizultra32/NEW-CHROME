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

  function post() {
    const demo = heuristics();
    const { fp, preview } = fingerprint(demo);
    safeSend({ type:'EHR_DEMOGRAPHICS', demo, fp, preview });
  }

  const mo = new MutationObserver(() => { post(); });
  mo.observe(document.documentElement, { subtree:true, childList:true, characterData:true });
  post();

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
        safeSend({ type:'MAP_PICK', section: currentSection, selector, framePath });
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
