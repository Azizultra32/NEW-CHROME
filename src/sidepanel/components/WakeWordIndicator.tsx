/**
 * Wake Word Indicator Component
 * Visual feedback for wake word detection state
 */

import React from 'react';
import { RecordingState } from '../lib/wakeword';

interface WakeWordIndicatorProps {
  state: RecordingState;
}

export function WakeWordIndicator({ state }: WakeWordIndicatorProps) {
  const stateConfig = {
    [RecordingState.IDLE]: {
      icon: '😴',
      label: 'Sleeping',
      color: 'text-gray-400',
      bgColor: 'bg-gray-100',
      pulse: false,
    },
    [RecordingState.ARMED]: {
      icon: '👂',
      label: 'Listening',
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
      pulse: true,
    },
    [RecordingState.RECORDING]: {
      icon: '🔴',
      label: 'Recording',
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      pulse: true,
    },
  };

  const config = stateConfig[state];

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${config.bgColor} ${
        config.pulse ? 'animate-pulse' : ''
      }`}
    >
      <span className="text-sm">{config.icon}</span>
      <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
    </div>
  );
}
