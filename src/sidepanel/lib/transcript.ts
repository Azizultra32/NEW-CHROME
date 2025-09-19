type Seg = { id: string; text: string; t0?: number; t1?: number };

class TranscriptStore {
  private items: Seg[] = [];
  private subs: Array<(s: Seg[]) => void> = [];
  private recentTexts: Set<string> = new Set();
  private recentTimer?: number;

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
  }
  addBoundary(label: string) {
    const id = Math.random().toString(36).slice(2);
    this.items.push({ id, text: `[boundary] ${label}` });
    if (this.items.length > 500) this.items.shift();
    this.emit();
  }
  clear() { 
    this.items = []; 
    this.recentTexts.clear();
    if (this.recentTimer) clearTimeout(this.recentTimer);
    this.emit(); 
  }
}

export const transcript = new TranscriptStore();
