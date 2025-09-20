type Seg = { id: string; text: string; t0?: number; t1?: number };

class TranscriptStore {
  private items: Seg[] = [];
  private subs: Array<(s: Seg[]) => void> = [];

  get() { return this.items; }
  sub(fn: (s: Seg[]) => void) { this.subs.push(fn); return () => this.unsub(fn); }
  private unsub(fn: (s: Seg[]) => void) { this.subs = this.subs.filter(f => f !== fn); }
  private emit() { this.subs.forEach(fn => fn(this.items)); }

  addPartial(text: string, t0?: number, t1?: number) {
    const id = Math.random().toString(36).slice(2);
    this.items.push({ id, text, t0, t1 });
    if (this.items.length > 500) {
      this.items.shift();
    }
    this.emit();
  }
  clear() { this.items = []; this.emit(); }
}

export const transcript = new TranscriptStore();
