class PcmCapture extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    const p = (opts && opts.processorOptions) || {};
    this.frame = (p.frameSize | 0) || 160; // 10ms @ 16k
    this._buf = new Float32Array(0);
  }

  process(inputs) {
    const ch0 = inputs[0] && inputs[0][0];
    if (!ch0) return true;

    const merged = new Float32Array(this._buf.length + ch0.length);
    merged.set(this._buf, 0);
    merged.set(ch0, this._buf.length);

    let off = 0;
    const total = merged.length;

    while (off + this.frame <= total) {
      const slice = merged.subarray(off, off + this.frame);
      const i16 = new Int16Array(this.frame);
      for (let i = 0; i < this.frame; i++) {
        let s = slice[i];
        s = s < -1 ? -1 : s > 1 ? 1 : s;
        i16[i] = (s < 0 ? s * 0x8000 : s * 0x7FFF) | 0;
      }
      this.port.postMessage({
        type: 'frame',
        pcm: i16,
        t0: currentTime * 1000
      });
      off += this.frame;
    }

    const rem = total - off;
    this._buf = rem ? merged.subarray(off) : new Float32Array(0);

    return true;
  }
}

registerProcessor('pcm-capture', PcmCapture);
