/**
 * Chat Bubble Component
 * Visual assistant replies in side panel
 */

import React from 'react';

export interface ChatMessage {
  message: string;
  type: 'user' | 'assistant';
  timestamp: Date;
}

interface ChatBubbleProps {
  message: string;
  type: 'user' | 'assistant';
  timestamp: Date;
}

function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function ChatBubble({ message, type, timestamp }: ChatBubbleProps) {
  const isAssistant = type === 'assistant';

  return (
    <div
      className={`flex ${isAssistant ? 'justify-start' : 'justify-end'} mb-3 animate-fade-in`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isAssistant
            ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white'
            : 'bg-gray-700 text-gray-100'
        }`}
      >
        <div className="flex items-center gap-2 mb-1 text-xs opacity-80">
          <span>{isAssistant ? '🤖 AssistMD' : '👤 You'}</span>
          <span className="text-[10px]">{formatTime(timestamp)}</span>
        </div>
        <div className="text-sm leading-relaxed">{message}</div>
      </div>
    </div>
  );
}

interface ChatLogProps {
  messages: ChatMessage[];
  autoScroll?: boolean;
}

export function ChatLog({ messages, autoScroll = true }: ChatLogProps) {
  const logRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  if (messages.length === 0) {
    return (
      <div className="text-center text-gray-500 text-sm py-8">
        No assistant messages yet. Try saying "assist vitals?" or "assist compose note"
      </div>
    );
  }

  return (
    <div
      ref={logRef}
      className="flex flex-col gap-1 max-h-[300px] overflow-y-auto px-2 py-2 bg-gray-900 rounded-lg"
    >
      {messages.map((msg, idx) => (
        <ChatBubble
          key={idx}
          message={msg.message}
          type={msg.type}
          timestamp={msg.timestamp}
        />
      ))}
    </div>
  );
}
