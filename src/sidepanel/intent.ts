export type Intent =
  | { name: 'start' }
  | { name: 'stop' }
  | { name: 'pause' }
  | { name: 'resume' }
  | { name: 'bookmark' }
  | { name: 'newline' }
  | { name: 'timestamp' }
  | { name: 'insert'; section: 'plan' | 'hpi' | 'ros' | 'exam' };

export function parseIntent(raw: string): Intent | null {
  const s = normalize(raw);
  // Accept wake word anywhere; if absent, allow direct phrases
  const idx = s.indexOf('assist ');
  const rest = idx !== -1 ? s.slice(idx + 7).trim() : s;

  if (/^start( recording|$)/.test(rest)) return { name: 'start' };
  if (/^stop( recording|$)/.test(rest)) return { name: 'stop' };
  if (/^pause( recording|$)/.test(rest)) return { name: 'pause' };
  if (/^resume( recording|$)/.test(rest)) return { name: 'resume' };
  if (rest === 'bookmark') return { name: 'bookmark' };
  if (rest === 'timestamp') return { name: 'timestamp' };
  if (/^(new\s?line|newline)$/.test(rest)) return { name: 'newline' };
  const m = rest.match(/^insert (plan|hpi|ros|exam)$/);
  if (m) return { name: 'insert', section: m[1] as any };
  return null;
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"’]/g, ' ')
    .replace(/\b(u(h|m)|uh|um)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
