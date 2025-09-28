import React, { useMemo } from 'react';

type Props = {
  pairingEnabled: boolean;
  pairingSummary: string;
  lastKnown: { title?: string; url?: string | null } | null;
};

export function WindowIndicator({ pairingEnabled, pairingSummary, lastKnown }: Props) {
  const hostInfo = useMemo(() => {
    if (!lastKnown?.url) return null;
    try {
      const url = new URL(lastKnown.url);
      return { host: url.hostname, title: lastKnown.title || url.hostname };
    } catch {
      return null;
    }
  }, [lastKnown]);

  return (
    <div className="window-indicator">
      <div className="window-status">
        <div className="status-dot" data-connected={pairingEnabled} title={pairingEnabled ? 'Window pairing enabled' : 'Window pairing disabled'} />
        <div className="status-text">
          <div className="font-medium">{pairingEnabled ? 'Magnetized side window' : 'Pairing disabled'}</div>
          <div className="text-[11px] text-slate-600">{pairingSummary}</div>
          {hostInfo && (
            <div className="text-[11px] text-slate-500">Last window: {hostInfo.title}</div>
          )}
        </div>
      </div>
      <style jsx>{`
        .window-indicator {
          background: rgba(15, 23, 42, 0.04);
          padding: 8px 12px;
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 8px;
          font-size: 12px;
        }
        .window-status {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #9ca3af;
          flex-shrink: 0;
        }
        .status-dot[data-connected="true"] {
          background: #16a34a;
        }
      `}</style>
    </div>
  );
}
