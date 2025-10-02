/**
 * Armada Backend Server
 *
 * Production-ready backend with:
 * - OpenAI Realtime API integration
 * - PHI pseudonymization
 * - Note composition
 * - Clinical safety rails
 * - Audit logging
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';

import { OpenAIRealtimeClient, createVoiceCommandFunctions } from './openai-realtime.js';
import { pseudonymize, rehydrate, serializePHIMap, getRedactionStats } from './phi-redactor.js';
import { composeNote, getTemplate } from './note-composer.js';
import { runSafetyRails } from './safety-rails.js';
import {
  logEncounterStart,
  logEncounterEnd,
  logPHIRedaction,
  logNoteComposition,
  queryAuditLogs
} from './audit-logger.js';

// Configuration
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || 'localhost';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not set in environment');
  process.exit(1);
}

// Express app
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    features: {
      phi_redaction: process.env.ENABLE_LOCAL_PHI_REDACTION === 'true',
      safety_rails: process.env.ENABLE_SAFETY_RAILS === 'true',
      note_composition: process.env.ENABLE_NOTE_COMPOSITION === 'true'
    }
  });
});

// Presign endpoint - returns WebSocket URL for encounter
app.post('/v1/encounters/:id/presign', (req, res) => {
  const { id } = req.params;
  const wsUrl = `ws://${HOST}:${PORT}/asr?encounterId=${id}`;

  console.log('[Presign] Generated URL for encounter:', id);

  res.json({
    wssUrl: wsUrl,
    headers: {},
    encounterId: id
  });
});

// Note composition endpoint
app.post('/v1/encounters/:id/compose', async (req, res) => {
  try {
    const { id } = req.params;
    const { transcript, phiMap, noteFormat, specialty } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'Missing transcript' });
    }

    console.log(`[Compose] Starting note composition for encounter ${id}`);

    const result = await composeNote({
      transcript,
      phiMap: phiMap || {},
      noteFormat: noteFormat || 'SOAP',
      specialty: specialty || 'family_medicine',
      encounterId: id
    });

    console.log(`[Compose] Note composed successfully for encounter ${id}`);

    res.json(result);

  } catch (error) {
    console.error('[Compose] Error:', error);
    res.status(500).json({
      error: 'Note composition failed',
      message: error.message
    });
  }
});

// Template endpoint
app.get('/v1/templates/:section', (req, res) => {
  const { section } = req.params;
  const { specialty } = req.query;

  const template = getTemplate(section.toUpperCase(), specialty || 'family_medicine');

  if (template) {
    res.json({ section, template });
  } else {
    res.status(404).json({ error: 'Template not found' });
  }
});

// Audit logs query endpoint (for compliance reports)
app.get('/v1/audit/logs', async (req, res) => {
  try {
    const { encounterId, eventType, limit } = req.query;

    const logs = await queryAuditLogs({
      encounterId,
      eventType,
      limit: limit ? parseInt(limit) : 100
    });

    res.json({ logs, count: logs.length });

  } catch (error) {
    console.error('[Audit] Query failed:', error);
    res.status(500).json({ error: 'Audit query failed' });
  }
});

// Legacy audit endpoint (for backward compatibility)
app.post('/v1/audit', (req, res) => {
  const { type, encounterId, fp, extra } = req.body || {};
  console.log('[Audit]', new Date().toISOString(), type, encounterId, fp, extra || '');
  res.json({ ok: true });
});

// Create HTTP server
const server = createServer(app);

// WebSocket server for audio streaming
const wss = new WebSocketServer({ server, path: '/asr' });

// Active connections map: encounterId → connection context
const activeConnections = new Map();

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${HOST}`);
  const encounterId = url.searchParams.get('encounterId') || `enc_${Date.now()}`;
  const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  console.log(`[ASR][WS] Client connected: ${clientId} (encounter: ${encounterId})`);

  // Connection context
  const context = {
    clientId,
    encounterId,
    ws,
    openaiClient: null,
    phiMap: new Map(),
    transcriptBuffer: [],
    startTime: Date.now(),
    ipAddress: req.socket.remoteAddress
  };

  activeConnections.set(clientId, context);

  // Audit log
  await logEncounterStart(encounterId, null, null, context.ipAddress);

  // Initialize OpenAI Realtime client
  try {
    const openaiClient = new OpenAIRealtimeClient(OPENAI_API_KEY, {
      turnDetectionEnabled: true,
      voiceCommandFunctions: createVoiceCommandFunctions(),

      onTranscript: async (event) => {
        const { type, text, timestamp } = event;

        console.log(`[OpenAI] Transcript (${type}):`, text.slice(0, 60));

        // Pseudonymize transcript if enabled
        let finalText = text;
        let phiUpdated = false;

        if (process.env.ENABLE_LOCAL_PHI_REDACTION === 'true') {
          const result = pseudonymize(text, context.phiMap);
          finalText = result.text;
          context.phiMap = result.phiMap;
          phiUpdated = true;

          if (phiUpdated) {
            const stats = getRedactionStats(context.phiMap);
            await logPHIRedaction(encounterId, stats);
          }
        }

        // Store in buffer
        context.transcriptBuffer.push({
          type,
          text: finalText,
          originalText: text,
          timestamp
        });

        // Send to browser (pseudonymized)
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'partial',
            text: finalText,
            t0: timestamp,
            t1: timestamp + 1000,
            phiMap: phiUpdated ? serializePHIMap(context.phiMap) : undefined
          }));
        }
      },

      onError: (error) => {
        console.error(`[OpenAI] Error for ${clientId}:`, error);
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Transcription service error'
          }));
        }
      },

      onConnectionChange: (status) => {
        console.log(`[OpenAI] Connection status for ${clientId}:`, status);
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'connection_status',
            status
          }));
        }
      },

      onFunctionCall: async ({ name, arguments: args }) => {
        console.log(`[OpenAI] Function call: ${name}`, args);

        // Handle voice commands
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'voice_command',
            command: name,
            arguments: args
          }));
        }
      }
    });

    await openaiClient.connect();
    context.openaiClient = openaiClient;

    console.log(`[OpenAI] Connected for ${clientId}`);

  } catch (error) {
    console.error(`[OpenAI] Failed to initialize for ${clientId}:`, error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to connect to transcription service'
    }));
    return;
  }

  // Handle incoming messages from browser
  ws.on('message', (data) => {
    try {
      // Check if binary (audio data)
      if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
        // Forward audio to OpenAI
        if (context.openaiClient?.isConnected()) {
          context.openaiClient.sendAudio(data);
        }
        return;
      }

      // JSON message
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'hello':
          // Initial handshake
          ws.send(JSON.stringify({
            type: 'ready',
            encounterId,
            clientId
          }));
          break;

        case 'commit':
          // Commit audio buffer (trigger transcription)
          if (context.openaiClient?.isConnected()) {
            context.openaiClient.commitAudio();
          }
          break;

        case 'clear':
          // Clear audio buffer
          if (context.openaiClient?.isConnected()) {
            context.openaiClient.clearAudio();
          }
          break;

        case 'ping':
          // Heartbeat
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
          break;

        default:
          console.log(`[ASR][WS] Unknown message type: ${message.type}`);
      }

    } catch (error) {
      console.error(`[ASR][WS] Message handling error for ${clientId}:`, error);
    }
  });

  // Handle disconnection
  ws.on('close', async () => {
    console.log(`[ASR][WS] Client disconnected: ${clientId}`);

    // Cleanup OpenAI client
    if (context.openaiClient) {
      context.openaiClient.disconnect();
    }

    // Audit log
    const duration = Date.now() - context.startTime;
    await logEncounterEnd(encounterId, null, duration);

    // Remove from active connections
    activeConnections.delete(clientId);
  });

  ws.on('error', (error) => {
    console.error(`[ASR][WS] Error for ${clientId}:`, error);
  });
});

// Start server
server.listen(PORT, HOST, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Armada Backend - Production Ready');
  console.log('='.repeat(60));
  console.log(`\n📡 Server: http://${HOST}:${PORT}`);
  console.log(`🔌 WebSocket: ws://${HOST}:${PORT}/asr`);
  console.log(`\n🔐 Security:`);
  console.log(`   PHI Redaction: ${process.env.ENABLE_LOCAL_PHI_REDACTION === 'true' ? '✅' : '❌'}`);
  console.log(`   Safety Rails: ${process.env.ENABLE_SAFETY_RAILS === 'true' ? '✅' : '❌'}`);
  console.log(`   Audit Logging: ✅`);
  console.log(`\n🤖 AI:`);
  console.log(`   OpenAI Realtime: ✅`);
  console.log(`   Note Composer: ${process.env.ENABLE_NOTE_COMPOSITION === 'true' ? '✅' : '❌'}`);
  console.log(`\n📝 Endpoints:`);
  console.log(`   POST /v1/encounters/:id/presign`);
  console.log(`   POST /v1/encounters/:id/compose`);
  console.log(`   GET  /v1/templates/:section?specialty=...`);
  console.log(`   GET  /v1/audit/logs?encounterId=...`);
  console.log(`   GET  /health`);
  console.log('\n' + '='.repeat(60) + '\n');
  console.log('✨ Ready to receive connections from extension\n');
});