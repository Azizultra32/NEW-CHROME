import React, { useEffect, useRef, useState } from 'react';
import { transcript } from '../lib/transcript';

export const TranscriptList: React.FC = () => {
  const [items, setItems] = useState(transcript.get());
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => transcript.sub(setItems), []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 40) {
      el.scrollTop = el.scrollHeight;
    }
  }, [items]);

  return (
    <section className="min-h-[160px] rounded-xl border border-slate-200 bg-white/70 p-3">
      {items.length === 0 ? (
        <div className="text-sm text-slate-500">No transcript yet. Click <b>Start</b> and speak.</div>
      ) : (
        <div ref={listRef} className="max-h-[300px] overflow-auto">
          <ul className="space-y-1 text-sm text-slate-800">
            {items.map(i => (<li key={i.id}>{i.text}</li>))}
          </ul>
        </div>
      )}
    </section>
  );
};
