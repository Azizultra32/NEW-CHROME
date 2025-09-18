export type PartialSeg = { text: string; t0?: number; t1?: number };

export function connectASR(wssUrl: string, onPartial: (p: PartialSeg) => void) {
  const ws = new WebSocket(wssUrl);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'hello', codec: 'webm/opus', sr: 48000 }));
  });
  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg?.type === 'partial' && msg?.text) {
        onPartial({ text: msg.text, t0: msg.t0, t1: msg.t1 });
      }
    } catch (error) {
      console.warn('Failed to parse WS message', error);
    }
  });
  return ws;
}
