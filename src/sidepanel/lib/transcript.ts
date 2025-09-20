type Seg = { id: string; text: string; t0?: number; t1?: number };

const STORAGE_KEY = 'ASSISTMD_LAST_TRANSCRIPT_V1';

class TranscriptStore {
  private items: Seg[] = [];
  private subs: Array<(s: Seg[]) => void> = [];
  private recentTexts: Set<string> = new Set();
  private recentTimer?: number;
  private saveTimer?: number;

  get() { return this.items; }
  sub(fn: (s: Seg[]) => void) { this.subs.push(fn); return () => this.unsub(fn); }
  private unsub(fn: (s: Seg[]) => void) { this.subs = this.subs.filter(f => f !== fn); }
  private emit() { this.subs.forEach(fn => fn(this.items)); }

  addPartial(text: string, t0?: number, t1?: number) {
    // De-duplicate identical messages within 2 second window
    const textKey = text.trim().toLowerCase();
    if (this.recentTexts.has(textKey)) {
      console.log('[AssistMD] Skipping duplicate partial:', text);
      return;
    }
    
    this.recentTexts.add(textKey);
    if (this.recentTimer) clearTimeout(this.recentTimer);
    this.recentTimer = window.setTimeout(() => {
      this.recentTexts.clear();
    }, 2000);
    
    const id = Math.random().toString(36).slice(2);
    this.items.push({ id, text, t0, t1 });
    if (this.items.length > 500) {
      this.items.shift();
    }
    this.emit();
    this.scheduleSave();
  }
  addBoundary(label: string) {
    const id = Math.random().toString(36).slice(2);
    this.items.push({ id, text: `[boundary] ${label}` });
    if (this.items.length > 500) this.items.shift();
    this.emit();
    this.scheduleSave();
  }
  clear() { 
    this.items = []; 
    this.recentTexts.clear();
    if (this.recentTimer) clearTimeout(this.recentTimer);
    this.emit();
    this.scheduleSave();
  }

  private scheduleSave() {
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => { this.save().catch(() => {}); }, 350);
  }

  private async save() {
    try {
      const payload = { ts: Date.now(), items: this.items };
      await chrome.storage.local.set({ [STORAGE_KEY]: payload });
    } catch {}
  }

  async loadFromStorage() {
    try {
      const bag = await chrome.storage.local.get([STORAGE_KEY]);
      const data = bag?.[STORAGE_KEY];
      if (!data || !Array.isArray(data.items)) return false;
      const safe: Seg[] = data.items
        .filter((x: any) => x && typeof x.text === 'string')
        .map((x: any) => ({ id: x.id || Math.random().toString(36).slice(2), text: x.text, t0: x.t0, t1: x.t1 }))
        .slice(-500);
      this.items = safe;
      this.emit();
      return true;
    } catch {
      return false;
    }
  }
}

export const transcript = new TranscriptStore();
