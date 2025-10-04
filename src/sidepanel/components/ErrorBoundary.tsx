import React from 'react';

type State = { hasError: boolean; message?: string };

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(err: any): State { return { hasError: true, message: String(err?.message || 'Error') }; }
  componentDidCatch(error: any, info: any) {
    try { /* no-op: avoid PHI logs */ } catch {}
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-[12px] text-slate-700">
          <div className="text-sm font-semibold text-slate-900">Something went wrong</div>
          <div className="mt-1 text-slate-600">Reload the side panel or open Settings to continue.</div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

