/**
 * Command Audio Tagger
 * Tags command audio to exclude from clinical transcript
 */

export interface TaggedAudio {
  audio: ArrayBuffer;
  timestamp: number;
  suppress: boolean; // If true, backend should NOT send to Whisper
}

export class CommandTagger {
  private commandWindow = 300; // ms barge-in window
  private suppressUntil = 0; // Timestamp until which to suppress audio

  /**
   * Mark that a command was detected
   * Next 300ms of audio will be tagged as suppress=true
   */
  markCommandDetected() {
    this.suppressUntil = Date.now() + this.commandWindow;
    console.log(`[CommandTagger] Suppressing audio for ${this.commandWindow}ms`);
  }

  /**
   * Tag audio chunk
   * Returns tagged audio with suppress flag
   */
  tagAudio(audioChunk: ArrayBuffer): TaggedAudio {
    const now = Date.now();
    const suppress = now < this.suppressUntil;

    if (suppress) {
      console.log('[CommandTagger] Audio suppressed (command window active)');
    }

    return {
      audio: audioChunk,
      timestamp: now,
      suppress,
    };
  }

  /**
   * Check if currently suppressing
   */
  isSuppressing(): boolean {
    return Date.now() < this.suppressUntil;
  }

  /**
   * Clear suppression (force allow all audio)
   */
  clearSuppression() {
    this.suppressUntil = 0;
    console.log('[CommandTagger] Suppression cleared');
  }

  /**
   * Set command window duration
   */
  setCommandWindow(ms: number) {
    this.commandWindow = ms;
  }
}

// Singleton instance
export const commandTagger = new CommandTagger();
