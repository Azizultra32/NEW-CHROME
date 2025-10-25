import React, { useState } from 'react';

type Props = {
  onClose: () => void;
  onOpenSettings: () => void;
};

export const QuickStartGuide: React.FC<Props> = ({ onClose, onOpenSettings }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: '👋 Welcome to AssistMD',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            AssistMD is your AI medical scribe with advanced EHR integration.
          </p>
          <p className="text-sm text-slate-700">
            This quick guide will help you set up the essential features.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
            <strong>What you'll learn:</strong>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>Window pairing (auto-open assistant)</li>
              <li>Ghost preview (see before you paste)</li>
              <li>Compose notes with patient data</li>
              <li>Keyboard shortcuts</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      title: '🪟 Window Pairing',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            <strong>Window Pairing</strong> makes the assistant window "stick" to your EHR window.
          </p>
          <div className="bg-slate-100 rounded-lg p-3 text-xs space-y-2">
            <div>
              <strong className="text-slate-900">Step 1:</strong> Open Settings (⚙️ button top-right)
            </div>
            <div>
              <strong className="text-slate-900">Step 2:</strong> Scroll to "Window Management"
            </div>
            <div>
              <strong className="text-slate-900">Step 3:</strong> Toggle <strong>"Auto-pair on allowed hosts"</strong> ON
            </div>
          </div>
          <p className="text-xs text-slate-600">
            Now when you open your EHR, the assistant window will automatically appear on the right side!
          </p>
          <button
            onClick={onOpenSettings}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Open Settings Now →
          </button>
        </div>
      ),
    },
    {
      title: '👻 Ghost Preview',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            <strong>Ghost Preview</strong> shows you exactly where text will paste BEFORE you commit.
          </p>
          <div className="bg-slate-900 text-slate-100 rounded-lg p-4 text-xs space-y-2 font-mono">
            <div><kbd className="bg-slate-700 px-2 py-1 rounded">⌥ Option+G</kbd> Show preview</div>
            <div><kbd className="bg-slate-700 px-2 py-1 rounded">⌥ Option+Enter</kbd> Execute paste</div>
            <div><kbd className="bg-slate-700 px-2 py-1 rounded">Esc</kbd> Clear preview</div>
          </div>
          <p className="text-xs text-slate-600">
            You'll see red boxes over EHR fields with confidence scores (e.g., "Plan 90%").
          </p>
          <div className="border-2 border-dashed border-indigo-400 rounded-lg p-3 text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="bg-indigo-600 text-white px-2 py-1 rounded-full text-xs">Plan 90%</span>
            </div>
            <div className="text-slate-600">Patient presents with chest pain radiating to left arm...</div>
            <div className="mt-2 text-right text-slate-500">450 chars</div>
          </div>
        </div>
      ),
    },
    {
      title: '📝 Compose Note',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            <strong>Compose Note</strong> generates a complete SOAP note with actual patient names (PHI re-hydration).
          </p>
          <div className="bg-slate-100 rounded-lg p-3 text-xs space-y-2">
            <div>
              <strong className="text-slate-900">Step 1:</strong> Record your encounter (click Start Recording)
            </div>
            <div>
              <strong className="text-slate-900">Step 2:</strong> Click <strong>"📝 Compose Note (with PHI)"</strong>
            </div>
            <div>
              <strong className="text-slate-900">Step 3:</strong> Review the 4 sections (S/O/A/P)
            </div>
            <div>
              <strong className="text-slate-900">Step 4:</strong> Click "Insert" on each section
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800">
            <strong>🔒 HIPAA Compliant:</strong> PHI is encrypted (AES-256) before storage. Session keys are never persisted.
          </div>
        </div>
      ),
    },
    {
      title: '⌨️ Keyboard Shortcuts',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">Master these shortcuts for faster workflow:</p>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="py-2 pr-4 font-mono text-slate-600">⌥ Option+G</td>
                <td className="py-2 text-slate-700">Show ghost preview</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-slate-600">⌥ Option+Enter</td>
                <td className="py-2 text-slate-700">Execute batch paste</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-slate-600">Esc</td>
                <td className="py-2 text-slate-700">Clear ghost preview</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-slate-600">⌥ Option+R</td>
                <td className="py-2 text-slate-700">Toggle redaction (hide PHI)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-slate-600">⌘ Cmd+`</td>
                <td className="py-2 text-slate-700">Toggle Focus/Peek mode</td>
              </tr>
            </tbody>
          </table>
        </div>
      ),
    },
    {
      title: '✅ You\'re Ready!',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            You're all set to use AssistMD! Here's a quick recap:
          </p>
          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2">
              <span className="text-green-600">✓</span>
              <span>Enable auto-pair in Settings → Window Management</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600">✓</span>
              <span>Use ⌥ Option+G to preview before pasting</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600">✓</span>
              <span>Click "📝 Compose Note" to generate full SOAP note</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600">✓</span>
              <span>Master keyboard shortcuts for speed</span>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <strong>⚠️ Before Production:</strong>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>Verify OpenAI BAA is signed</li>
              <li>Ensure backend is HIPAA-compliant hosting</li>
              <li>Test on your actual EHR (not just test pages)</li>
            </ul>
          </div>
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Start Using AssistMD →
          </button>
        </div>
      ),
    },
  ];

  const currentStep = steps[step];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">{currentStep.title}</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {/* Progress bar */}
          <div className="mt-3 flex gap-1">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`h-1 flex-1 rounded-full ${
                  idx <= step ? 'bg-indigo-600' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {currentStep.content}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Back
          </button>
          <span className="text-xs text-slate-500">
            {step + 1} of {steps.length}
          </span>
          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500"
            >
              Get Started →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
