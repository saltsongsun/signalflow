'use client';
import { useState } from 'react';
import { Connection, supabase } from '../lib/supabase';

type Props = {
  connection: Connection;
  fromName: string;
  toName: string;
  onClose: () => void;
  onDelete: () => void;
};

export default function CableEditor({ connection, fromName, toName, onClose, onDelete }: Props) {
  const [tieLine, setTieLine] = useState(connection.tie_line ?? '');
  const [isPatch, setIsPatch] = useState(connection.is_patch ?? false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await (supabase as any).from('connections').update({
      tie_line: tieLine.trim() || null,
      is_patch: isPatch,
    }).eq('id', connection.id);
    setSaving(false);
    onClose();
  };

  return (
    <div
      data-ui
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-[440px] bg-gradient-to-b from-neutral-900 to-neutral-950 border border-white/15 rounded-xl shadow-2xl"
      >
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-sky-500/10 to-transparent">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-gradient-to-b from-sky-400 to-sky-600 rounded-full"></div>
            <div className="text-sm font-semibold">케이블 속성</div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded hover:bg-white/10 text-neutral-400">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono bg-black/30 rounded-lg px-3 py-2 border border-white/5">
            <span className="text-sky-300 truncate flex-1">{fromName}</span>
            <span className="text-neutral-500">·</span>
            <span className="text-neutral-400 text-[10px]">{connection.from_port}</span>
            <span className="text-teal-400 text-base">→</span>
            <span className="text-neutral-400 text-[10px]">{connection.to_port}</span>
            <span className="text-neutral-500">·</span>
            <span className="text-orange-300 truncate flex-1 text-right">{toName}</span>
          </div>

          {/* Tie-Line number */}
          <div>
            <label className="block text-[10px] uppercase tracking-[0.12em] text-neutral-500 mb-1.5 font-semibold">
              Tie-Line 번호
              <span className="text-neutral-600 normal-case tracking-normal ml-1 font-normal">물리 라인 식별자</span>
            </label>
            <input
              value={tieLine}
              onChange={e => setTieLine(e.target.value)}
              placeholder="예: TIE-V001, AUDIO-TL-12"
              className="w-full bg-neutral-900 border border-white/10 rounded px-3 py-2 text-sm font-mono text-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
            />
            <div className="text-[10px] text-neutral-500 mt-1">
              케이블에 물리 라인 번호를 달면 도면에 번호가 표시됩니다.
            </div>
          </div>

          {/* is_patch toggle */}
          <div className="bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 rounded-lg p-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPatch}
                onChange={e => setIsPatch(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-amber-500"
              />
              <div className="flex-1">
                <div className="text-[11px] font-semibold text-amber-200">수동 패치 케이블 (Patch)</div>
                <div className="text-[10px] text-neutral-500 mt-0.5 leading-relaxed">
                  체크: 주황 점선 + 애니메이션으로 표시. 패치베이의 normal을 끊고 지나가는 수동 케이블.<br/>
                  해제: 일반 실선(기본 배선 · normal-thru).
                </div>
              </div>
            </label>
          </div>

          <div className="flex gap-2 pt-2 border-t border-white/5">
            <button onClick={save} disabled={saving}
              className="flex-1 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 disabled:opacity-50 text-white py-2.5 text-sm rounded-lg font-semibold shadow-lg shadow-sky-500/30 transition">
              {saving ? '저장중…' : '저장'}
            </button>
            <button onClick={() => { if (confirm('이 케이블 삭제?')) onDelete(); }}
              className="px-5 bg-rose-500/10 hover:bg-rose-500 text-rose-300 hover:text-white py-2.5 text-sm rounded-lg font-medium border border-rose-500/30 hover:border-rose-500 transition">
              삭제
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
