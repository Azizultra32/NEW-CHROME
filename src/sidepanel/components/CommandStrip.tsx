import React from 'react';

type Props = { message: string };

export const CommandStrip: React.FC<Props> = ({ message }) => (
  <div className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-700">
    {message}
  </div>
);
