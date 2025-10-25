import React from 'react';

type Props = {
  recording: boolean;
  focusMode: boolean;
  opacity: number;
  mode: 'idle' | 'mock' | 'live';
  wsState: 'disconnected' | 'connecting' | 'open' | 'error';
  host?: string;
  hostAllowed?: boolean;
  onToggleFocus: () => void;
  onOpacity: (v: number) => void;
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
  pairingEnabled?: boolean;
  pairingSummary?: string;
  pairingBusy?: boolean;
  onTogglePairing?: (next: boolean) => void;
};

const modeClasses = {
  live: 'bg-emerald-600 text-white',
  mock: 'bg-amber-500 text-white',
  idle: 'bg-slate-200 text-slate-700'
} as const;

const wsClasses = {
  open: 'bg-emerald-600 text-white',
  connecting: 'bg-indigo-600 text-white',
  error: 'bg-rose-600 text-white',
  disconnected: 'bg-slate-200 text-slate-700'
} as const;

export const Header: React.FC<Props> = ({
  recording,
  focusMode,
  opacity,
  mode,
  wsState,
  host,
  hostAllowed,
  onToggleFocus,
  onOpacity,
  onOpenSettings,
  onOpenHelp,
  pairingEnabled,
  pairingSummary,
  pairingBusy,
  onTogglePairing
}) => {
  return (
    <header className="flex flex-wrap items-center gap-3">
      <h1 className="text-lg font-semibold">AssistMD</h1>
      <span className={`ml-2 px-2 py-1 text-xs rounded-full ${recording ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-700'}`}>
        {recording ? '● Recording' : 'Idle'}
      </span>
      <span className={`px-2 py-1 text-xs rounded-full ${modeClasses[mode]}`}>
        {mode === 'live' ? 'Live' : mode === 'mock' ? 'Mock' : 'Idle'}
      </span>
      <span className={`px-2 py-1 text-xs rounded-full capitalize ${wsClasses[wsState]}`}>
        {wsState}
      </span>
      {host && (
        <span className={`px-2 py-1 text-xs rounded-full ${hostAllowed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`} title={hostAllowed ? 'This host is allowlisted' : 'This host is not allowlisted'}>
          {hostAllowed ? 'Allowed' : 'Not allowed'}
        </span>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
        {typeof pairingEnabled === 'boolean' && onTogglePairing && (
          <button
            className={`px-2 py-1 rounded-md border ${pairingEnabled ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300'}`}
            onClick={() => onTogglePairing(!pairingEnabled)}
            title={pairingSummary || 'Toggle window pairing'}
            disabled={pairingBusy}
          >
            {pairingEnabled ? 'Pairing On' : 'Pairing Off'}
          </button>
        )}
        <button
          className={`px-2 py-1 rounded-md border ${focusMode ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300'}`}
          onClick={onToggleFocus}
          title="Peek/Focus (Cmd/Ctrl + `)"
        >
          {focusMode ? 'Focus' : 'Peek'}
        </button>
        {onOpenHelp && (
          <button
            className="px-2 py-1 rounded-md border bg-emerald-600 text-white border-emerald-600 font-semibold"
            onClick={onOpenHelp}
            title="Quick Start Guide"
          >
            ❓ Help
          </button>
        )}
        {onOpenSettings && (
          <button
            className="px-2 py-1 rounded-md border bg-indigo-600 text-white border-indigo-600 font-semibold"
            onClick={onOpenSettings}
            title="Settings"
          >
            ⚙️ Settings
          </button>
        )}
        <label className="flex items-center gap-2" title="Adjust panel opacity">
          <span className="text-slate-500">Opacity</span>
          <input
            type="range" min={10} max={90} value={opacity}
            onChange={(e) => onOpacity(Number(e.target.value))}
          />
        </label>
      </div>
    </header>
  );
};
