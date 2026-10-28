import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}

export function Feedback({ error, children }: { error?: boolean; children: ReactNode }) {
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={`rounded-lg border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}
    >
      {children}
    </div>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-3 text-xl font-bold tracking-tight text-slate-900">
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-xl bg-blue-700 text-white"
      >
        M
      </span>
      MarkSync
    </div>
  );
}
