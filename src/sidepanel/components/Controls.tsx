import React from 'react';

type Props = {
  recording: boolean;
  busy: boolean;
  onToggleRecord: () => Promise<void> | void;
  onInsertPlan?: () => void;
  onCopyTranscript?: () => void;
  transcriptFormat?: 'RAW' | 'SOAP' | 'APSO';
  onFormatChange?: (fmt: 'RAW' | 'SOAP' | 'APSO') => void;
  onMapFields?: () => void;
};

export const Controls: React.FC<Props> = ({ recording, busy, onToggleRecord, onInsertPlan, onCopyTranscript, transcriptFormat = 'RAW', onFormatChange, onMapFields }) => {
  const disabledLook = 'opacity-60 cursor-not-allowed';

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={onToggleRecord}
        disabled={!recording && busy}
        className={`rounded-lg px-3 py-2 font-medium ${
          recording ? 'bg-rose-600 hover:bg-rose-700 text-white'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
        } ${!recording && busy ? disabledLook : ''}`}
      >
        {recording ? 'Stop' : 'Start'} Recording
      </button>
      <button
        className={`rounded-lg px-3 py-2 font-medium bg-slate-100 text-slate-800 ${
          recording ? 'hover:bg-slate-200' : disabledLook
        }`}
        title={recording ? 'Smart Paste (wired later)' : 'Start recording to enable'}
        disabled={!recording}
        onClick={() => onInsertPlan?.()}
      >
        Insert Plan
      </button>
      <button
        className="rounded-lg px-3 py-2 font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 col-span-2"
        onClick={() => onCopyTranscript?.()}
      >
        Copy Transcript
      </button>
      <div className="col-span-2 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
        <span>Format</span>
        <select
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 bg-white"
          value={transcriptFormat}
          onChange={(e) => onFormatChange?.(e.target.value as 'RAW' | 'SOAP' | 'APSO')}
        >
          <option value="RAW">Raw</option>
          <option value="SOAP">SOAP</option>
          <option value="APSO">APSO</option>
        </select>
      </div>
      <button
        className="rounded-lg px-3 py-2 font-medium bg-slate-100 text-slate-800 col-span-2 opacity-60 cursor-not-allowed"
        disabled
        onClick={() => onMapFields?.()}
      >
        Map Fields
      </button>
    </div>
  );
};
