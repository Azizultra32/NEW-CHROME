// Unified Speech Recognition Manager
// Handles both voice commands and continuous listening with proper lifecycle management

export type SpeechRecognitionState = 'idle' | 'listening' | 'paused' | 'error';

export interface SpeechRecognitionConfig {
  onResult?: (transcript: string) => void;
  onStateChange?: (state: SpeechRecognitionState) => void;
  onError?: (error: any) => void;
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
}

export class SpeechRecognitionManager {
  private recognition: any = null;
  private state: SpeechRecognitionState = 'idle';
  private config: SpeechRecognitionConfig;
  private restartTimer: number | null = null;
  private retryCount = 0;
  private maxRetries = 3;
  private retryDelay = 1000;
  private isDestroyed = false;
  private lastStartTime = 0;
  private minRestartInterval = 500; // Prevent rapid restarts
  private isStarting = false;

  constructor(config: SpeechRecognitionConfig) {
    this.config = {
      continuous: true,
      interimResults: false,
      lang: 'en-US',
      ...config
    };
    this.initialize();
  }

  private initialize() {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;

    if (!SpeechRecognition) {
      // Silently skip if not available - voice may be handled elsewhere (offscreen doc)
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = this.config.continuous;
      this.recognition.interimResults = this.config.interimResults;
      this.recognition.lang = this.config.lang;

      this.setupEventHandlers();
    } catch (error) {
      console.error('[SpeechRecognition] Initialization failed:', error);
      this.setState('error');
      this.config.onError?.(error);
    }
  }

  private setupEventHandlers() {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      if ((window as any).__ASSIST_DEBUG) console.log('[SpeechRecognition] Started');
      this.setState('listening');
      this.retryCount = 0; // Reset retry count on successful start
      this.isStarting = false;
    };

    this.recognition.onend = () => {
      if ((window as any).__ASSIST_DEBUG) console.log('[SpeechRecognition] Ended', { 
        state: this.state, 
        isDestroyed: this.isDestroyed,
        continuous: this.config.continuous 
      });
      
      if (this.state === 'listening') {
        this.setState('idle');
      }
      this.isStarting = false;

      // Auto-restart for continuous mode if not explicitly stopped
      if (this.config.continuous && !this.isDestroyed && this.state !== 'paused') {
        this.scheduleRestart();
      }
    };

    this.recognition.onerror = (event: any) => {
      const error = event.error || 'unknown';
      if ((window as any).__ASSIST_DEBUG) console.warn('[SpeechRecognition] Error:', error, { retryCount: this.retryCount });

      // Handle specific error types
      switch (error) {
        case 'no-speech':
        case 'audio-capture':
          // These are recoverable, just log and continue
          console.log('[SpeechRecognition] Recoverable error, will retry');
          if (this.config.continuous) {
            this.scheduleRestart();
          }
          break;
          
        case 'not-allowed':
          // Permission denied
          this.setState('error');
          this.config.onError?.('Microphone permission denied');
          break;
          
        case 'network':
          // Network error, retry with backoff
          if (this.retryCount < this.maxRetries) {
            this.scheduleRestart(this.retryDelay * Math.pow(2, this.retryCount));
          } else {
            this.setState('error');
            this.config.onError?.('Network error after multiple retries');
          }
          break;
          
        case 'aborted':
          // Usually happens when stop() is called, ignore
          break;
          
        default:
          // Unknown error
          this.setState('error');
          this.config.onError?.(error);
      }
    };

    this.recognition.onresult = (event: any) => {
      const lastResult = event.results[event.results.length - 1];
      if (!lastResult) return;

      const transcript = lastResult[0]?.transcript?.trim();
      if (transcript) {
        if ((window as any).__ASSIST_DEBUG) console.log('[SpeechRecognition] Result:', transcript);
        this.config.onResult?.(transcript);
      }
    };
  }

  private setState(newState: SpeechRecognitionState) {
    if (this.state !== newState) {
      if ((window as any).__ASSIST_DEBUG) console.log('[SpeechRecognition] State change:', this.state, '->', newState);
      this.state = newState;
      this.config.onStateChange?.(newState);
    }
  }

  private scheduleRestart(delay: number = 300) {
    if (this.isDestroyed) return;

    // Clear any existing restart timer
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
    }

    this.restartTimer = window.setTimeout(() => {
      this.restartTimer = null;
      if (!this.isDestroyed && this.state !== 'paused') {
        this.start();
      }
    }, delay);
  }

  start(): boolean {
    if (this.isDestroyed || !this.recognition) {
      if ((window as any).__ASSIST_DEBUG) console.warn('[SpeechRecognition] Cannot start - destroyed or not initialized');
      return false;
    }

    // Prevent rapid restarts
    const now = Date.now();
    if (now - this.lastStartTime < this.minRestartInterval) {
      if ((window as any).__ASSIST_DEBUG) console.log('[SpeechRecognition] Skipping start - too soon after last start');
      this.scheduleRestart(this.minRestartInterval);
      return false;
    }
    this.lastStartTime = now;

    // Clear any pending restart
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    try {
      // Only start if not already listening
      if (this.state !== 'listening' && !this.isStarting) {
        if ((window as any).__ASSIST_DEBUG) console.log('[SpeechRecognition] Starting...');
        this.isStarting = true;
        this.recognition.start();
        this.retryCount++;
        return true;
      } else {
        if ((window as any).__ASSIST_DEBUG) console.log('[SpeechRecognition] Already listening or starting');
        return true;
      }
    } catch (error: any) {
      this.isStarting = false;
      if ((window as any).__ASSIST_DEBUG) console.error('[SpeechRecognition] Start failed:', error);
      
      // If it's because we're already started, that's okay
      if (error.message?.includes('already started')) {
        this.setState('listening');
        return true;
      }
      
      // Otherwise, schedule a retry
      if (this.config.continuous && this.retryCount < this.maxRetries) {
        this.scheduleRestart(this.retryDelay * Math.pow(2, this.retryCount));
      } else {
        this.setState('error');
        this.config.onError?.(error);
      }
      return false;
    }
  }

  stop() {
    if ((window as any).__ASSIST_DEBUG) console.log('[SpeechRecognition] Stopping...');
    
    // Clear any pending restart
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.recognition && this.state === 'listening') {
      try {
        this.recognition.stop();
      } catch (error) {
        console.warn('[SpeechRecognition] Stop error:', error);
      }
    }
    
    this.setState('idle');
  }

  pause() {
    if ((window as any).__ASSIST_DEBUG) console.log('[SpeechRecognition] Pausing...');
    this.setState('paused');
    this.stop();
  }

  resume() {
    if ((window as any).__ASSIST_DEBUG) console.log('[SpeechRecognition] Resuming...');
    if (this.state === 'paused') {
      this.setState('idle');
      this.start();
    }
  }

  destroy() {
    if ((window as any).__ASSIST_DEBUG) console.log('[SpeechRecognition] Destroying...');
    this.isDestroyed = true;
    this.stop();
    
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    
    this.recognition = null;
    this.isStarting = false;
  }

  getState(): SpeechRecognitionState {
    return this.state;
  }

  isListening(): boolean {
    return this.state === 'listening';
  }
}
