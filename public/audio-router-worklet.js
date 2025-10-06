// Lightweight audio router/VAD worklet
// Splits incoming mono stream into logical paths and emits simple VAD state.

class AudioRouter extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.sampleRate = sampleRate; // from AudioWorklet global
    this.rmsOn = 0.015; // activate speaking
    this.rmsOff = 0.010; // deactivate speaking
    this.frameMs = 10; // approx, depends on render quantum
    this.speaking = false;
    this.speechFrames = 0;
    this.quietFrames = 0;
    this.minSpeechFrames = Math.ceil(180 / this.frameMs);
    this.hangFrames = Math.ceil(350 / this.frameMs);
    this.dictationHangFrames = 0;
  }

  calcRms(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      sum += v * v;
    }
    return Math.sqrt(sum / Math.max(1, buf.length));
  }

  postVad(state) {
    try { this.port.postMessage({ type: 'vad', state }); } catch {}
  }

  process(inputs, outputs, parameters) {
    const ch = (inputs[0] && inputs[0][0]) ? inputs[0][0] : null;
    if (!ch) return true;

    const rms = this.calcRms(ch);
    const loud = rms >= this.rmsOn;
    const quiet = rms < this.rmsOff;

    if (!this.speaking) {
      if (loud) {
        this.speechFrames++;
        if (this.speechFrames >= this.minSpeechFrames) {
          this.speaking = true;
          this.speechFrames = 0;
          this.quietFrames = 0;
          this.dictationHangFrames = this.hangFrames;
          this.postVad('speaking');
        }
      } else {
        this.speechFrames = 0;
      }
    } else {
      if (quiet) {
        this.quietFrames++;
        if (this.quietFrames >= this.hangFrames) {
          this.speaking = false;
          this.quietFrames = 0;
          this.dictationHangFrames = 0;
          this.postVad('quiet');
        }
      } else {
        this.quietFrames = 0;
        this.dictationHangFrames = this.hangFrames;
      }
    }

    if (!this.speaking && this.dictationHangFrames > 0) {
      this.dictationHangFrames = Math.max(0, this.dictationHangFrames - 1);
    }

    // Keep processor alive
    return true;
  }
}

registerProcessor('audio-router', AudioRouter);

