import { useCallback, useEffect, useRef, useState } from 'react';
import { parseIntent, Intent } from '../intent';
import { isTtsSpeaking } from '../lib/voice';

type Opts = {
  onIntent: (intent: Intent) => void;
  onListeningChange?: (listening: boolean) => void;
  autoStart?: boolean;
};

export function useVoice({ onIntent, onListeningChange, autoStart = false }: Opts) {
  const recogRef = useRef<any>(null);
  const autoRestartRef = useRef<boolean>(!!autoStart);
  const timerRef = useRef<number | null>(null);
  const [listening, setListening] = useState(false);

  const ensureRecognizer = useCallback(() => {
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return null;
    if (!recogRef.current) {
      const r = new SR();
      r.lang = 'en-US';
      r.continuous = false;
      r.interimResults = false;
      r.onresult = (event: any) => {
        if (isTtsSpeaking()) return;
        const transcript = Array.from(event.results)
          .map((res: any) => res[0]?.transcript || '')
          .join(' ')
          .trim();
        if (!transcript) return;
        const intent = parseIntent(transcript);
        if (!intent) return;
        onIntent(intent);
      };
      r.onstart = () => {
        setListening(true);
        onListeningChange?.(true);
      };
      r.onend = () => {
        setListening(false);
        onListeningChange?.(false);
        if (autoRestartRef.current) {
          try { r.start(); } catch {}
        }
      };
      recogRef.current = r;
    }
    return recogRef.current;
  }, [onIntent, onListeningChange]);

  const stop = useCallback(() => {
    const r = ensureRecognizer();
    if (!r) return;
    autoRestartRef.current = !!autoStart;
    try { r.stop(); } catch {}
  }, [ensureRecognizer, autoStart]);

  const start = useCallback((durationMs?: number) => {
    const r = ensureRecognizer();
    if (!r) return false;
    autoRestartRef.current = false;
    try { r.start(); } catch {
      return false;
    }
    if (durationMs && durationMs > 0) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        stop();
        timerRef.current = null;
      }, durationMs);
    }
    return true;
  }, [ensureRecognizer, stop]);

  useEffect(() => {
    if (!autoStart) return () => { stop(); };
    autoRestartRef.current = true;
    const r = ensureRecognizer();
    if (!r) return () => {};
    try { r.start(); } catch {}
    return () => {
      autoRestartRef.current = false;
      try { r.stop(); } catch {}
    };
  }, [ensureRecognizer, autoStart, stop]);

  return { start, stop, listening };
}
