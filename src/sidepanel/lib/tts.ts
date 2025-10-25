/**
 * TTS Engine with Ducking
 * Prevents AI voice from triggering its own microphone (self-trigger loop)
 */

export interface TTSOptions {
  voice?: SpeechSynthesisVoice;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export class TTSEngine {
  private synth: SpeechSynthesis;
  private onSpeakStart?: () => void;
  private onSpeakEnd?: () => void;
  private isSpeaking = false;
  private muteBuffer = 2000; // 2s buffer after speech to prevent echo

  constructor() {
    this.synth = window.speechSynthesis;
  }

  /**
   * Speak text with automatic ducking (pause mic during speech)
   */
  speak(text: string, options?: TTSOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isSpeaking) {
        this.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);

      // Apply options
      if (options?.voice) utterance.voice = options.voice;
      if (options?.rate) utterance.rate = options.rate;
      if (options?.pitch) utterance.pitch = options.pitch;
      if (options?.volume) utterance.volume = options.volume;

      utterance.onstart = () => {
        this.isSpeaking = true;
        console.log('[TTS] Speaking:', text.slice(0, 50));
        this.onSpeakStart?.(); // Trigger ducking (pause mic)
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        console.log('[TTS] Speech ended');

        // Add buffer before resuming mic (prevent echo)
        setTimeout(() => {
          this.onSpeakEnd?.(); // Resume mic
          resolve();
        }, this.muteBuffer);
      };

      utterance.onerror = (error) => {
        this.isSpeaking = false;
        console.error('[TTS] Error:', error);
        this.onSpeakEnd?.(); // Resume mic even on error
        reject(error);
      };

      this.synth.speak(utterance);
    });
  }

  /**
   * Set callbacks for mic ducking (pause/resume)
   */
  setDuckingCallbacks(onStart: () => void, onEnd: () => void) {
    this.onSpeakStart = onStart;
    this.onSpeakEnd = onEnd;
  }

  /**
   * Cancel current speech
   */
  cancel() {
    this.synth.cancel();
    this.isSpeaking = false;
  }

  /**
   * Get available voices
   */
  getVoices(): SpeechSynthesisVoice[] {
    return this.synth.getVoices();
  }

  /**
   * Check if currently speaking
   */
  get speaking(): boolean {
    return this.isSpeaking;
  }

  /**
   * Set mute buffer duration (ms)
   */
  setMuteBuffer(ms: number) {
    this.muteBuffer = ms;
  }
}

// Singleton instance
export const tts = new TTSEngine();
