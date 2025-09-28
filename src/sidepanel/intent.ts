export type Intent =
  | { name: 'start' }
  | { name: 'stop' }
  | { name: 'pause' }
  | { name: 'resume' }
  | { name: 'bookmark' }
  | { name: 'newline' }
  | { name: 'timestamp' }
  | { name: 'insert'; section: 'plan' | 'hpi' | 'ros' | 'exam' }
  | { name: 'template'; section: 'plan' | 'hpi' | 'ros' | 'exam' }
  | { name: 'map'; section: 'plan' | 'hpi' | 'ros' | 'exam' }
  | { name: 'template_edit'; section: 'plan' | 'hpi' | 'ros' | 'exam' }
  | { name: 'undo' };

export function parseIntent(raw: string): Intent | null {
  const s = normalize(raw);
  // Accept wake word anywhere; if absent, allow direct phrases
  const idx = s.indexOf('assist ');
  const rest = idx !== -1 ? s.slice(idx + 7).trim() : s;

  // Start/Stop/Pause/Resume with synonyms
  if (/^(start|begin|resume)( (record(ing)?|dictation))?$/.test(rest)) return { name: 'start' };
  if (/^(stop|end|finish)( (record(ing)?|dictation))?$/.test(rest)) return { name: 'stop' };
  if (/^pause( (record(ing)?|dictation))?$/.test(rest)) return { name: 'pause' };
  if (/^resume( (record(ing)?|dictation))?$/.test(rest)) return { name: 'resume' };

  // Utility
  if (/^(bookmark|flag|mark)$/.test(rest)) return { name: 'bookmark' };
  if (/^(timestamp|time\s?stamp|time)$/.test(rest)) return { name: 'timestamp' };
  if (/^(new\s?line|newline|new\s?paragraph)$/.test(rest)) return { name: 'newline' };

  // Insert commands
  const m = rest.match(/^(insert|add) (plan|hpi|ros|exam)$/);
  if (m) return { name: 'insert', section: m[2] as any };
  const map = rest.match(/^(map|remap) (plan|hpi|ros|exam)$/);
  if (map) return { name: 'map', section: map[2] as any };
  const editTpl = rest.match(/^(edit template|template edit|update template) (plan|hpi|ros|exam)$/);
  if (editTpl) return { name: 'template_edit', section: editTpl[2] as any };
  // Template commands
  const t = rest.match(/^(template|insert template) (plan|hpi|ros|exam)$/);
  if (t) return { name: 'template', section: t[2] as any };
  // Undo
  if (/^undo( insert)?$/.test(rest)) return { name: 'undo' };
  
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
