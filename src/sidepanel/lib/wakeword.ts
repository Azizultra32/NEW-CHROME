/**
 * Wake Word Detector
 * Hands-free activation via "assist" keyword
 */

export enum RecordingState {
  IDLE = 'IDLE',           // Not listening
  ARMED = 'ARMED',         // Wake word detected, waiting for command
  RECORDING = 'RECORDING', // Active recording
}

export interface WakeWordOptions {
  keyword?: string;
  sensitivity?: number; // 0-1, higher = more sensitive (more false positives)
  confirmationMode?: boolean; // Require visual confirmation before arming
}

export class WakeWordDetector {
  private recognition: SpeechRecognition | null = null;
  private state: RecordingState = RecordingState.IDLE;
  private onWakeDetected?: () => void;
  private onStateChange?: (state: RecordingState) => void;
  private keyword: string;
  private sensitivity: number;
  private confirmationMode: boolean;
  private isActive = false;

  constructor(options: WakeWordOptions = {}) {
    this.keyword = options.keyword || 'assist';
    this.sensitivity = options.sensitivity || 0.8;
    this.confirmationMode = options.confirmationMode || false;

    // Initialize Web Speech Recognition
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error('[WakeWord] Speech Recognition not supported');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      this.handleResult(event);
    };

    this.recognition.onerror = (event: any) => {
      console.error('[WakeWord] Recognition error:', event.error);
      if (event.error === 'no-speech' || event.error === 'aborted') {
        // Auto-restart on common errors
        setTimeout(() => this.start(), 500);
      }
    };

    this.recognition.onend = () => {
      // Auto-restart if still active
      if (this.isActive && this.state === RecordingState.IDLE) {
        setTimeout(() => this.start(), 100);
      }
    };
  }

  private handleResult(event: SpeechRecognitionEvent) {
    // Only detect wake word in IDLE state
    if (this.state !== RecordingState.IDLE) return;

    // Concatenate all results
    const transcript = Array.from(event.results)
      .map((r) => r[0].transcript.toLowerCase())
      .join(' ');

    console.log('[WakeWord] Heard:', transcript.slice(0, 50));

    // Check for wake word
    if (transcript.includes(this.keyword)) {
      const confidence = event.results[event.results.length - 1][0].confidence;

      console.log(`[WakeWord] Detected "${this.keyword}" (confidence: ${confidence})`);

      // Check sensitivity threshold
      if (confidence >= this.sensitivity) {
        this.setState(RecordingState.ARMED);
        this.onWakeDetected?.();

        // If not in confirmation mode, auto-start recording
        if (!this.confirmationMode) {
          // Give 1s for user to start speaking
          setTimeout(() => {
            if (this.state === RecordingState.ARMED) {
              this.setState(RecordingState.RECORDING);
            }
          }, 1000);
        }
      }
    }
  }

  private setState(newState: RecordingState) {
    if (this.state !== newState) {
      console.log(`[WakeWord] State: ${this.state} → ${newState}`);
      this.state = newState;
      this.onStateChange?.(newState);
    }
  }

  /**
   * Start wake word detection
   */
  start() {
    if (!this.recognition) {
      console.error('[WakeWord] Recognition not initialized');
      return;
    }

    if (this.isActive) return;

    try {
      this.isActive = true;
      this.setState(RecordingState.IDLE);
      this.recognition.start();
      console.log('[WakeWord] Listening for "' + this.keyword + '"...');
    } catch (error) {
      console.error('[WakeWord] Start error:', error);
      this.isActive = false;
    }
  }

  /**
   * Stop wake word detection
   */
  stop() {
    if (!this.recognition || !this.isActive) return;

    try {
      this.isActive = false;
      this.recognition.stop();
      this.setState(RecordingState.IDLE);
      console.log('[WakeWord] Stopped');
    } catch (error) {
      console.error('[WakeWord] Stop error:', error);
    }
  }

  /**
   * Pause wake word detection (e.g., during TTS playback)
   */
  pause() {
    if (!this.recognition || !this.isActive) return;

    try {
      this.recognition.stop();
      console.log('[WakeWord] Paused (TTS active)');
    } catch (error) {
      console.error('[WakeWord] Pause error:', error);
    }
  }

  /**
   * Resume wake word detection after pause
   */
  resume() {
    if (!this.recognition || !this.isActive) return;

    try {
      // Add delay to prevent echo
      setTimeout(() => {
        if (this.isActive && this.state === RecordingState.IDLE) {
          this.recognition!.start();
          console.log('[WakeWord] Resumed');
        }
      }, 500);
    } catch (error) {
      console.error('[WakeWord] Resume error:', error);
    }
  }

  /**
   * Set wake word detected callback
   */
  setWakeCallback(callback: () => void) {
    this.onWakeDetected = callback;
  }

  /**
   * Set state change callback
   */
  setStateChangeCallback(callback: (state: RecordingState) => void) {
    this.onStateChange = callback;
  }

  /**
   * Manually transition to recording state
   */
  startRecording() {
    this.setState(RecordingState.RECORDING);
  }

  /**
   * Get current state
   */
  getState(): RecordingState {
    return this.state;
  }

  /**
   * Reset to IDLE state
   */
  reset() {
    this.setState(RecordingState.IDLE);
  }
}

// Singleton instance
export const wakeWord = new WakeWordDetector();
