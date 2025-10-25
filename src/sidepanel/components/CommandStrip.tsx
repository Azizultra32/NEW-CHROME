import React from 'react';
import { SpeechRecognitionState } from '../lib/speechRecognition';

type Props = { 
  message: string;
  speechState?: SpeechRecognitionState;
};

export const CommandStrip: React.FC<Props> = ({ message, speechState }) => {
  const getStateIndicator = () => {
    switch (speechState) {
      case 'listening':
        return <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2" title="Voice commands active" />;
      case 'paused':
        return <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-2" title="Voice commands paused" />;
      case 'error':
        return <span className="inline-block w-2 h-2 bg-red-500 rounded-full mr-2" title="Voice error" />;
      default:
        return <span className="inline-block w-2 h-2 bg-gray-400 rounded-full mr-2" title="Voice commands inactive" />;
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-700 flex items-center">
      {getStateIndicator()}
      {message}
    </div>
  );
};
