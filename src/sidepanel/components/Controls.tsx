import React from 'react';

type Props = {
  recording: boolean;
  busy: boolean;
  onToggleRecord: () => Promise<void> | void;
  onInsertPlan?: () => void;
  onInsertHPI?: () => void;
  onInsertROS?: () => void;
  onInsertEXAM?: () => void;
  onUndo?: () => void;
  onCopyTranscript?: () => void;
  transcriptFormat?: 'RAW' | 'SOAP' | 'APSO';
  onFormatChange?: (fmt: 'RAW' | 'SOAP' | 'APSO') => void;
  onMapFields?: () => void;
};

export const Controls: React.FC<Props> = ({ recording, busy, onToggleRecord, onInsertPlan, onInsertHPI, onInsertROS, onInsertEXAM, onUndo, onCopyTranscript, transcriptFormat = 'RAW', onFormatChange, onMapFields }) => {
  const disabledLook = 'opacity-60 cursor-not-allowed';
  const canMapFields = typeof onMapFields === 'function';

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
      {onInsertHPI && (
      <button
        className={`rounded-lg px-3 py-2 font-medium bg-slate-100 text-slate-800 ${ recording ? 'hover:bg-slate-200' : disabledLook }`}
        disabled={!recording}
        onClick={() => onInsertHPI?.()}
        title={recording ? 'Insert HPI' : 'Start recording to enable'}
      >
        Insert HPI
      </button>
      )}
      {onInsertROS && (
      <button
        className={`rounded-lg px-3 py-2 font-medium bg-slate-100 text-slate-800 ${ recording ? 'hover:bg-slate-200' : disabledLook }`}
        disabled={!recording}
        onClick={() => onInsertROS?.()}
        title={recording ? 'Insert ROS' : 'Start recording to enable'}
      >
        Insert ROS
      </button>
      )}
      {onInsertEXAM && (
      <button
        className={`rounded-lg px-3 py-2 font-medium bg-slate-100 text-slate-800 ${ recording ? 'hover:bg-slate-200' : disabledLook }`}
        disabled={!recording}
        onClick={() => onInsertEXAM?.()}
        title={recording ? 'Insert EXAM' : 'Start recording to enable'}
      >
        Insert EXAM
      </button>
      )}
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
        className={`rounded-lg px-3 py-2 font-medium bg-slate-100 text-slate-800 col-span-2 ${
          canMapFields ? 'hover:bg-slate-200' : disabledLook
        }`}
        disabled={!canMapFields}
        onClick={() => onMapFields?.()}
      >
        Map Fields
      </button>
      {onUndo && (
        <button
          className="rounded-lg px-3 py-2 font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 col-span-2"
          onClick={() => onUndo?.()}
        >
          Undo Last Insert
        </button>
      )}
    </div>
  );
};
