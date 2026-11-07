'use client';
import { useEffect, useState } from 'react';
import { Check, AlertTriangle, Loader2 } from 'lucide-react';
import { subscribeSaveStatus, SaveStatus } from '../lib/supabase';

// 저장 상태 표시 — 자체 구독이라 저장할 때마다 도면 전체가 다시 렌더되지 않음
export default function SaveIndicator({ onOpenSnapshots }: { onOpenSnapshots?: () => void }) {
  const [s, setS] = useState<SaveStatus>({ pending: 0, error: null, errorAt: 0, okAt: 0 });
  const [, setTick] = useState(0);
  useEffect(() => subscribeSaveStatus(setS), []);

  const now = Date.now();
  const showError = !!s.error && s.errorAt >= s.okAt && now - s.errorAt < 12000;
  const showOk = !showError && s.pending === 0 && s.okAt > 0 && now - s.okAt < 2500;

  // '저장됨'/'저장 실패' 표시를 일정 시간 뒤 자동으로 숨김
  useEffect(() => {
    if (!showOk && !showError) return;
    const t = window.setTimeout(() => setTick(n => n + 1), showError ? 12100 : 2600);
    return () => window.clearTimeout(t);
  }, [showOk, showError, s.okAt, s.errorAt]);

  if (s.pending > 0) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-[var(--ui-muted)] whitespace-nowrap" title="저장 중">
        <Loader2 size={12} className="animate-spin" />
        <span className="hidden lg:inline">저장 중</span>
      </span>
    );
  }
  if (showError) {
    return (
      <button
        type="button"
        onClick={onOpenSnapshots}
        className="flex items-center gap-1 h-6 px-1.5 rounded text-[11px] font-medium whitespace-nowrap bg-rose-500/15 text-rose-500 border border-rose-500/40"
        title={`저장 실패: ${s.error}\n다시 시도하거나, 스냅샷으로 이전 상태를 복원할 수 있습니다. (클릭: 스냅샷 열기)`}
      >
        <AlertTriangle size={12} />
        <span>저장 실패</span>
      </button>
    );
  }
  if (showOk) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-emerald-500 whitespace-nowrap" title="저장됨">
        <Check size={12} />
        <span className="hidden lg:inline">저장됨</span>
      </span>
    );
  }
  return null;
}
