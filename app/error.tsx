'use client';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[Global Error]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white p-6">
      <div className="max-w-md w-full bg-neutral-900 border border-rose-500/40 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="text-3xl">⚠️</div>
          <div>
            <div className="text-lg font-bold">예외 발생</div>
            <div className="text-[11px] text-neutral-500 font-mono">{error.digest ?? 'no digest'}</div>
          </div>
        </div>
        <div className="bg-black/40 border border-white/10 rounded p-3 text-[11px] font-mono text-rose-200 break-all max-h-64 overflow-auto">
          {error.message}
          {error.stack && <pre className="mt-2 text-[10px] text-neutral-400 whitespace-pre-wrap">{error.stack}</pre>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => reset()}
            className="flex-1 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded font-medium"
          >다시 시도</button>
          <a
            href="/"
            className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white rounded font-medium text-center"
          >홈으로</a>
        </div>
      </div>
    </div>
  );
}
