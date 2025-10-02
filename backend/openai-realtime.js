/**
 * OpenAI Realtime API Client
 *
 * Manages WebSocket connection to OpenAI's Realtime API (GPT-4o)
 * for low-latency speech-to-text transcription with built-in VAD.
 *
 * Features:
 * - Bidirectional audio streaming
 * - Real-time transcription partials
 * - Function calling for voice commands
 * - Automatic reconnection
 */

import WebSocket from 'ws';
import { logAPIFailure, logSecurityAlert } from './audit-logger.js';

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';
const MODEL = 'gpt-4o-realtime-preview-2024-12-17';

/**
 * OpenAI Realtime Client
 */
export class OpenAIRealtimeClient {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.model = options.model || MODEL;
    this.ws = null;
    this.connected = false;
    this.sessionId = null;

    // Event handlers
    this.onTranscript = options.onTranscript || (() => {});
    this.onError = options.onError || (() => {});
    this.onConnectionChange = options.onConnectionChange || (() => {});

    // Configuration
    this.turnDetectionEnabled = options.turnDetectionEnabled !== false;
    this.voiceCommandFunctions = options.voiceCommandFunctions || [];

    // Reconnection
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start at 1s, exponential backoff
  }

  /**
   * Connect to OpenAI Realtime API
   */
  async connect() {
    return new Promise((resolve, reject) => {
      const url = `${OPENAI_REALTIME_URL}?model=${this.model}`;

      this.ws = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      });

      this.ws.on('open', () => {
        console.log('[OpenAI Realtime] Connected');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.onConnectionChange('connected');

        // Send session configuration
        this.configureSession();

        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        console.error('[OpenAI Realtime] WebSocket error:', error);
        this.onError(error);
        logAPIFailure('openai_realtime', error.message);
        reject(error);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`[OpenAI Realtime] Connection closed: ${code} ${reason}`);
        this.connected = false;
        this.onConnectionChange('disconnected');

        // Attempt reconnection if enabled
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
          console.log(`[OpenAI Realtime] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

          setTimeout(() => {
            this.connect().catch(err => {
              console.error('[OpenAI Realtime] Reconnection failed:', err);
            });
          }, delay);
        }
      });
    });
  }

  /**
   * Configure session with OpenAI
   */
  configureSession() {
    const config = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: `You are a medical transcription assistant.
Your role is to accurately transcribe medical conversations between doctors and patients.

Key responsibilities:
- Transcribe spoken words verbatim
- Identify speakers (doctor vs patient) when possible
- Maintain medical terminology accuracy
- Handle PHI (names, dates, numbers) precisely
- Respond to voice commands prefixed with "assist" (e.g., "assist insert plan")

Do not add interpretations or medical advice. Focus on accurate transcription.`,
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: this.turnDetectionEnabled ? {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        } : null,
        tools: this.voiceCommandFunctions.length > 0 ? this.voiceCommandFunctions : [],
        tool_choice: 'auto',
        temperature: 0.6,
        max_response_output_tokens: 4096
      }
    };

    this.send(config);
  }

  /**
   * Send message to OpenAI
   */
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[OpenAI Realtime] Cannot send message: not connected');
    }
  }

  /**
   * Send audio chunk to OpenAI
   * @param {Buffer|ArrayBuffer} audioData - PCM16 audio data
   */
  sendAudio(audioData) {
    // Convert to base64 if needed
    const base64Audio = Buffer.isBuffer(audioData)
      ? audioData.toString('base64')
      : Buffer.from(audioData).toString('base64');

    this.send({
      type: 'input_audio_buffer.append',
      audio: base64Audio
    });
  }

  /**
   * Commit audio buffer (trigger transcription)
   */
  commitAudio() {
    this.send({
      type: 'input_audio_buffer.commit'
    });
  }

  /**
   * Clear audio buffer
   */
  clearAudio() {
    this.send({
      type: 'input_audio_buffer.clear'
    });
  }

  /**
   * Handle incoming message from OpenAI
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'session.created':
          this.sessionId = message.session.id;
          console.log('[OpenAI Realtime] Session created:', this.sessionId);
          break;

        case 'session.updated':
          console.log('[OpenAI Realtime] Session updated');
          break;

        case 'conversation.item.created':
          // New conversation item (transcript or response)
          this.handleConversationItem(message.item);
          break;

        case 'conversation.item.input_audio_transcription.completed':
          // Transcription completed
          this.handleTranscription(message);
          break;

        case 'conversation.item.input_audio_transcription.failed':
          console.error('[OpenAI Realtime] Transcription failed:', message.error);
          break;

        case 'response.audio_transcript.delta':
          // Partial transcript from AI response
          this.handleTranscriptDelta(message);
          break;

        case 'response.audio_transcript.done':
          // Full transcript complete
          this.handleTranscriptDone(message);
          break;

        case 'response.function_call_arguments.delta':
          // Function call in progress
          break;

        case 'response.function_call_arguments.done':
          // Function call completed
          this.handleFunctionCall(message);
          break;

        case 'error':
          console.error('[OpenAI Realtime] Error:', message.error);
          this.onError(new Error(message.error.message));
          break;

        case 'input_audio_buffer.speech_started':
          console.log('[OpenAI Realtime] Speech detected (VAD)');
          break;

        case 'input_audio_buffer.speech_stopped':
          console.log('[OpenAI Realtime] Speech stopped (VAD)');
          break;

        default:
          // Log unknown message types for debugging
          if (process.env.NODE_ENV === 'development') {
            console.log('[OpenAI Realtime] Unknown message type:', message.type);
          }
      }
    } catch (err) {
      console.error('[OpenAI Realtime] Failed to parse message:', err);
    }
  }

  /**
   * Handle conversation item
   */
  handleConversationItem(item) {
    if (item.type === 'message' && item.role === 'user') {
      // User message created
      console.log('[OpenAI Realtime] User message created');
    }
  }

  /**
   * Handle transcription completion
   */
  handleTranscription(message) {
    const { transcript, item_id } = message;

    console.log('[OpenAI Realtime] Transcript:', transcript);

    // Emit transcript event
    this.onTranscript({
      type: 'final',
      text: transcript,
      itemId: item_id,
      timestamp: Date.now()
    });
  }

  /**
   * Handle partial transcript delta
   */
  handleTranscriptDelta(message) {
    const { delta, item_id } = message;

    // Emit partial transcript
    this.onTranscript({
      type: 'partial',
      text: delta,
      itemId: item_id,
      timestamp: Date.now()
    });
  }

  /**
   * Handle complete transcript
   */
  handleTranscriptDone(message) {
    const { transcript, item_id } = message;

    this.onTranscript({
      type: 'done',
      text: transcript,
      itemId: item_id,
      timestamp: Date.now()
    });
  }

  /**
   * Handle function call from voice command
   */
  handleFunctionCall(message) {
    const { name, arguments: args, call_id } = message;

    console.log('[OpenAI Realtime] Function call:', name, args);

    // Emit function call event (server.js will handle routing)
    if (this.onFunctionCall) {
      this.onFunctionCall({ name, arguments: args, callId: call_id });
    }
  }

  /**
   * Send text message (for testing or hybrid mode)
   */
  sendText(text, role = 'user') {
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role,
        content: [{
          type: 'input_text',
          text
        }]
      }
    });

    // Trigger response
    this.send({
      type: 'response.create'
    });
  }

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    this.shouldReconnect = false;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.onConnectionChange('disconnected');
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

/**
 * Create voice command function definitions for OpenAI
 */
export function createVoiceCommandFunctions() {
  return [
    {
      type: 'function',
      name: 'insert_section',
      description: 'Insert dictated content into a specific EHR section (PLAN, HPI, ROS, or EXAM)',
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: ['PLAN', 'HPI', 'ROS', 'EXAM'],
            description: 'The EHR section to insert into'
          }
        },
        required: ['section']
      }
    },
    {
      type: 'function',
      name: 'add_bookmark',
      description: 'Add a bookmark marker at current position in transcript',
      parameters: {
        type: 'object',
        properties: {}
      }
    },
    {
      type: 'function',
      name: 'pause_recording',
      description: 'Pause the recording',
      parameters: {
        type: 'object',
        properties: {}
      }
    },
    {
      type: 'function',
      name: 'resume_recording',
      description: 'Resume the recording after pause',
      parameters: {
        type: 'object',
        properties: {}
      }
    },
    {
      type: 'function',
      name: 'stop_recording',
      description: 'Stop the recording completely',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  ];
}

// Export for use in server
export default OpenAIRealtimeClient;