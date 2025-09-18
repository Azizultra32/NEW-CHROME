export type Intent =
  | { type: 'START_RECORD' }
  | { type: 'STOP_RECORD' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'BOOKMARK' }
  | { type: 'INSERT'; section: 'HPI' | 'ROS' | 'EXAM' | 'PLAN' }
  | { type: 'UNKNOWN'; raw: string };

export function parseIntent(text: string): Intent {
  const u = text.trim().toLowerCase();
  if (!u.startsWith('assist ')) return { type: 'UNKNOWN', raw: u };
  const cmd = u.slice(7);
  if (/^start( recording|$)/.test(cmd)) return { type: 'START_RECORD' };
  if (/^stop( recording|$)/.test(cmd)) return { type: 'STOP_RECORD' };
  if (/^pause/.test(cmd)) return { type: 'PAUSE' };
  if (/^resume/.test(cmd)) return { type: 'RESUME' };
  const m = cmd.match(/^insert (hpi|ros|exam|plan)$/);
  if (m) return { type: 'INSERT', section: m[1].toUpperCase() as any };
  if (/^bookmark/.test(cmd)) return { type: 'BOOKMARK' };
  return { type: 'UNKNOWN', raw: u };
}

let ttsSpeaking = false;
export function speak(text: string) {
  try {
    ttsSpeaking = true;
    const utter = new SpeechSynthesisUtterance(text);
    utter.onend = () => { ttsSpeaking = false; };
    utter.onerror = () => { ttsSpeaking = false; };
    speechSynthesis.speak(utter);
  } catch {}
}

export function isTtsSpeaking() {
  return ttsSpeaking;
}
