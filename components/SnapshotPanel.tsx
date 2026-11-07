'use client';
import { useState } from 'react';
import { History, X, Save, RotateCcw, Trash2, Loader2, RefreshCw } from 'lucide-react';
import type { SnapshotMeta } from '../lib/snapshots';

type Props = {
  snapshots: SnapshotMeta[] | null;   // null = 불러오는 중
  busy: string | null;                // 진행 중 작업 설명 (예: '복원 중…')
  error: string | null;
  notice: string | null;
  onCreate: (name: string) => void;
  onRestore: (s: SnapshotMeta) => void;
  onDelete: (s: SnapshotMeta) => void;
  onRefresh: () => void;
  onClose: () => void;
};

function fmtTime(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function ago(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return '방금';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

export default function SnapshotPanel({ snapshots, busy, error, notice, onCreate, onRestore, onDelete, onRefresh, onClose }: Props) {
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState<{ path: string; action: 'restore' | 'delete' } | null>(null);
  const disabled = !!busy;

  const submit = () => {
    if (disabled) return;
    onCreate(name.trim());
    setName('');
  };

  return (
    <div
      data-ui
      className="fixed z-40 right-3 w-[340px] max-w-[calc(100vw-24px)] flex flex-col rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel)] text-[var(--ui-text)] shadow-2xl shadow-black/40"
      style={{ top: 56, maxHeight: 'calc(100vh - 72px)' }}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3.5 h-11 border-b border-[var(--ui-border)] shrink-0">
        <History size={15} className="text-sky-500" />
        <div className="text-[13px] font-semibold flex-1">스냅샷 · 복원 지점</div>
        <button type="button" onClick={onRefresh} disabled={disabled} title="새로고침"
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-[var(--ui-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-hover)] disabled:opacity-40">
          <RefreshCw size={13} />
        </button>
        <button type="button" onClick={onClose} title="닫기"
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-[var(--ui-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-hover)]">
          <X size={15} />
        </button>
      </div>

      {/* 설명 + 지금 저장 */}
      <div className="px-3.5 py-3 border-b border-[var(--ui-border)] shrink-0">
        <p className="text-[11.5px] leading-relaxed text-[var(--ui-muted)] mb-2.5">
          도면 전체(장비·케이블·레이어)를 저장해 두고, 문제가 생기면 그 시점으로 되돌립니다.
          편집을 시작할 때·여러 장비를 지울 때·초기화 전에는 자동으로 저장되며, 복원 직전 상태도 자동 백업됩니다.
        </p>
        <div className="flex gap-1.5">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="이름 (예: 리허설 전 최종)"
            maxLength={60}
            disabled={disabled}
            className="flex-1 min-w-0 h-8 px-2.5 rounded-md text-[12.5px] bg-[var(--ui-seg)] border border-[var(--ui-border)] text-[var(--ui-text)] placeholder:text-[var(--ui-muted)] focus:outline-none focus:border-sky-500"
          />
          <button type="button" onClick={submit} disabled={disabled}
            className="h-8 px-3 rounded-md text-[12.5px] font-medium bg-sky-600 hover:bg-sky-500 text-white inline-flex items-center gap-1.5 disabled:opacity-50">
            <Save size={14} />지금 저장
          </button>
        </div>
        {busy && (
          <div className="mt-2 flex items-center gap-1.5 text-[12px] text-sky-500"><Loader2 size={13} className="animate-spin" />{busy}</div>
        )}
        {notice && !busy && <div className="mt-2 text-[12px] text-emerald-500">{notice}</div>}
        {error && !busy && <div className="mt-2 text-[12px] text-rose-500 whitespace-pre-line">{error}</div>}
      </div>

      {/* 목록 */}
      <div className="overflow-y-auto custom-scroll py-1">
        {snapshots === null && (
          <div className="px-3.5 py-6 text-center text-[12px] text-[var(--ui-muted)]"><Loader2 size={14} className="inline animate-spin mr-1" />불러오는 중…</div>
        )}
        {snapshots && snapshots.length === 0 && (
          <div className="px-3.5 py-6 text-center text-[12px] text-[var(--ui-muted)]">아직 저장된 스냅샷이 없습니다.</div>
        )}
        {snapshots?.map(s => {
          const asking = confirm?.path === s.path ? confirm.action : null;
          return (
            <div key={s.path} className="px-3.5 py-2.5 border-b border-[var(--ui-border)] last:border-b-0">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12.5px] font-medium truncate">{s.name || (s.kind === 'auto' ? '자동 백업' : '스냅샷')}</span>
                    <span className={`text-[10px] px-1 rounded shrink-0 ${s.kind === 'auto' ? 'bg-[var(--ui-seg)] text-[var(--ui-muted)]' : 'bg-sky-500/15 text-sky-500'}`}>
                      {s.kind === 'auto' ? '자동' : '수동'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--ui-muted)] mt-0.5">
                    {fmtTime(s.createdAt)} · {ago(s.createdAt)} · 장비 {s.deviceCount} · 케이블 {s.connectionCount}
                  </div>
                </div>
                {!asking && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button type="button" disabled={disabled} onClick={() => setConfirm({ path: s.path, action: 'restore' })}
                      className="h-7 px-2 rounded-md text-[11.5px] font-medium text-sky-500 hover:bg-sky-500/10 inline-flex items-center gap-1 disabled:opacity-40" title="이 시점으로 되돌리기">
                      <RotateCcw size={12} />복원
                    </button>
                    <button type="button" disabled={disabled} onClick={() => setConfirm({ path: s.path, action: 'delete' })}
                      className="h-7 w-7 rounded-md text-[var(--ui-muted)] hover:text-rose-500 hover:bg-rose-500/10 inline-flex items-center justify-center disabled:opacity-40" title="스냅샷 삭제">
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
              {asking && (
                <div className={`mt-2 rounded-lg p-2 text-[11.5px] ${asking === 'restore' ? 'bg-sky-500/10 border border-sky-500/30' : 'bg-rose-500/10 border border-rose-500/30'}`}>
                  <div className="mb-1.5 leading-relaxed">
                    {asking === 'restore'
                      ? `현재 도면을 이 시점(장비 ${s.deviceCount} · 케이블 ${s.connectionCount})으로 바꿉니다. 지금 상태는 '복원 직전 자동 백업'으로 먼저 저장됩니다.`
                      : '이 스냅샷 파일을 삭제합니다. 되돌릴 수 없습니다.'}
                  </div>
                  <div className="flex gap-1.5 justify-end">
                    <button type="button" onClick={() => setConfirm(null)}
                      className="h-7 px-2.5 rounded-md hover:bg-[var(--ui-hover)] text-[var(--ui-text-2)]">취소</button>
                    <button type="button" disabled={disabled}
                      onClick={() => { setConfirm(null); asking === 'restore' ? onRestore(s) : onDelete(s); }}
                      className={`h-7 px-2.5 rounded-md font-medium text-white ${asking === 'restore' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-rose-600 hover:bg-rose-500'}`}>
                      {asking === 'restore' ? '복원' : '삭제'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
