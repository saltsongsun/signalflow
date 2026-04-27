'use client';
import { useState } from 'react';
import { Device, Breaker, BreakerKind, BREAKER_KIND_LABELS, PhaseType, PHASE_LABELS, PHASE_VOLTAGE, BREAKER_CAPACITIES, BreakerCapacity, MAIN_BREAKER_CAPACITIES, MainBreakerCapacity } from '../lib/supabase';
import { breakerCapacityWatts, formatWatts } from '../lib/powerCalc';

type Props = {
  device: Device;
  onSave: (updates: Partial<Device>) => void;
  onClose: () => void;
};

const COLORS = ['#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#3B82F6', '#84CC16', '#F97316'];

export default function PanelboardEditor({ device, onSave, onClose }: Props) {
  const [breakers, setBreakers] = useState<Breaker[]>(device.breakers ?? []);
  const [mainPhase, setMainPhase] = useState<PhaseType>(device.panelMainPhase ?? 'three');
  const [mainCapacity, setMainCapacity] = useState<MainBreakerCapacity>((device.panelMainCapacity as MainBreakerCapacity) ?? 100);
  const [mainKind, setMainKind] = useState<BreakerKind>(device.panelMainKind ?? 'MCCB');
  const [outputs, setOutputs] = useState<string[]>(device.outputs ?? []);

  const addBreaker = (kind: BreakerKind, phase: PhaseType, capacityA: BreakerCapacity) => {
    // 메인 용량 검증 — 부하측 차단기 1개의 용량은 메인 용량 이하여야 함
    if (capacityA > mainCapacity) {
      alert(`부하측 차단기 용량 ${capacityA}A는 메인 차단기 용량 ${mainCapacity}A보다 클 수 없습니다.`);
      return;
    }
    const id = `br_${Date.now().toString(36)}`;
    const idx = breakers.length + 1;
    // 자동으로 OUT 포트도 하나 만들어 매핑
    const newOutPort = `OUT-${outputs.length + 1}`;
    setOutputs([...outputs, newOutPort]);
    setBreakers([...breakers, {
      id,
      name: `회로-${idx}`,
      kind,
      phase,
      capacityA,
      outputPort: newOutPort,
      color: COLORS[breakers.length % COLORS.length],
    }]);
  };

  const updateBreaker = (id: string, upd: Partial<Breaker>) => {
    setBreakers(breakers.map(b => b.id === id ? { ...b, ...upd } : b));
  };

  const deleteBreaker = (id: string) => {
    if (!confirm('이 차단기를 삭제하시겠습니까?')) return;
    const br = breakers.find(b => b.id === id);
    setBreakers(breakers.filter(b => b.id !== id));
    // 연결된 OUT 포트도 제거
    if (br?.outputPort) {
      setOutputs(outputs.filter(o => o !== br.outputPort));
    }
  };

  const handleSave = () => {
    // outputsMeta도 함께 업데이트 (전력 레이어로 분류)
    const outputsMeta: Record<string, any> = { ...(device.outputsMeta ?? {}) };
    breakers.forEach(b => {
      if (b.outputPort) {
        outputsMeta[b.outputPort] = {
          ...(outputsMeta[b.outputPort] ?? {}),
          name: b.outputPort,
          label: `${b.name} (${b.kind} ${b.capacityA}A)`,
          connType: 'POWER',
        };
      }
    });
    onSave({
      breakers,
      panelMainPhase: mainPhase,
      panelMainCapacity: mainCapacity,
      panelMainKind: mainKind,
      outputs,
      outputsMeta,
      // inputs은 1개 (메인 인입)
      inputs: device.inputs && device.inputs.length > 0 ? device.inputs : ['MAIN-IN'],
    });
  };

  const totalCapacityW = PHASE_VOLTAGE[mainPhase] * mainCapacity;

  return (
    <div data-ui className="fixed inset-0 z-[60] bg-gradient-to-br from-neutral-950 via-black to-neutral-950 text-white flex flex-col">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
        <span className="text-2xl">{device.role === 'power_strip' ? '🔌' : '⚡'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold truncate">{device.name} <span className="text-neutral-500 font-normal text-sm">— {device.role === 'power_strip' ? '멀티탭 설정 (16A · 8구)' : '배전반 설정'}</span></div>
          <div className="text-[11px] text-neutral-500 font-mono">
            {device.role === 'power_strip' ? '인입' : '메인'}: <span className="text-amber-300">{mainKind} · {PHASE_LABELS[mainPhase]} {mainCapacity}A</span>
            <span className="mx-1">·</span>
            <span className="text-amber-300">{formatWatts(totalCapacityW)}</span>
            <span className="mx-1">·</span>
            {device.role === 'power_strip' ? '구' : '부하측'}: <span className="text-cyan-300">{breakers.length}</span>
          </div>
        </div>
        <button onClick={handleSave} className="px-4 py-2 text-[12px] font-bold rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 text-white shadow-lg">✓ 저장</button>
        <button onClick={onClose} className="px-3 py-2 text-[12px] rounded-lg bg-white/5 hover:bg-white/10 border border-white/10">✕ 닫기</button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* 메인 차단기 (인입부) */}
        <section className="bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[15px]">🔝</span>
            <div className="flex-1">
              <div className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">메인 차단기 (인입부)</div>
              <div className="text-[10px] text-neutral-500">배전반 전체로 들어오는 전기를 한 번에 차단. 부하측보다 용량이 큼.</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10.5px] text-neutral-400 block mb-1">종류</label>
              <select
                value={mainKind}
                onChange={e => setMainKind(e.target.value as BreakerKind)}
                className="w-full bg-neutral-900 border border-amber-500/30 rounded px-2 py-1.5 text-[12px]"
              >
                <option value="MCCB">MCCB (배선차단기)</option>
                <option value="ELCB">ELCB (누전차단기)</option>
              </select>
            </div>
            <div>
              <label className="text-[10.5px] text-neutral-400 block mb-1">상</label>
              <select
                value={mainPhase}
                onChange={e => setMainPhase(e.target.value as PhaseType)}
                className="w-full bg-neutral-900 border border-amber-500/30 rounded px-2 py-1.5 text-[12px]"
              >
                <option value="single">단상 220V</option>
                <option value="three">3상 380V</option>
              </select>
            </div>
            <div>
              <label className="text-[10.5px] text-neutral-400 block mb-1">메인 용량 (A)</label>
              <select
                value={mainCapacity}
                onChange={e => {
                  const newCap = parseInt(e.target.value) as MainBreakerCapacity;
                  // 부하측에 newCap보다 큰 게 있으면 경고
                  const exceed = breakers.filter(b => b.capacityA > newCap);
                  if (exceed.length > 0) {
                    if (!confirm(`메인을 ${newCap}A로 줄이면 다음 부하측 차단기가 메인을 초과합니다:\n${exceed.map(b => `• ${b.name} (${b.capacityA}A)`).join('\n')}\n\n계속하시겠습니까? (부하측은 그대로 유지됨)`)) {
                      return;
                    }
                  }
                  setMainCapacity(newCap);
                }}
                className="w-full bg-neutral-900 border border-amber-500/30 rounded px-2 py-1.5 text-[12px] font-mono font-bold"
              >
                {MAIN_BREAKER_CAPACITIES.map(c => (
                  <option key={c} value={c}>{c}A</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-2 text-[10.5px] text-amber-200/80 bg-amber-500/5 border border-amber-500/15 rounded p-2 flex items-center justify-between">
            <span>최대 공급 전력</span>
            <span className="font-mono font-bold">{formatWatts(totalCapacityW)}</span>
            <span className="text-neutral-500">({PHASE_VOLTAGE[mainPhase]}V × {mainCapacity}A)</span>
          </div>
        </section>

        {/* 부하측 차단기 추가 */}
        <section className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[11px] font-bold text-neutral-300 uppercase tracking-wider">부하측 차단기 추가 (분기)</div>
              <div className="text-[10px] text-neutral-500">메인 차단기 ({mainCapacity}A) 이하 용량만 선택 가능</div>
            </div>
            <div className="text-[10px] text-neutral-500">현재 <span className="text-cyan-300 font-bold">{breakers.length}</span>개 차단기</div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <BreakerAddGroup label="배선차단기 (MCCB)" kind="MCCB" mainCapacity={mainCapacity} onAdd={addBreaker} />
            <BreakerAddGroup label="누전차단기 (ELCB)" kind="ELCB" mainCapacity={mainCapacity} onAdd={addBreaker} />
          </div>
        </section>

        {/* 부하측 차단기 목록 */}
        <section className="bg-white/[0.02] border border-white/10 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10 text-[11px] font-bold text-neutral-300 uppercase tracking-wider flex items-center justify-between">
            <span>부하측 차단기 목록 — OUT 포트는 자동 매핑됨</span>
            {breakers.length > 0 && (() => {
              const sumA = breakers.reduce((s, b) => s + b.capacityA, 0);
              const overSum = sumA > mainCapacity;
              return (
                <span className={`text-[9.5px] font-mono font-bold px-2 py-0.5 rounded ${
                  overSum ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'
                }`} title={overSum ? '부하측 합계가 메인을 초과 — 동시 사용 불가' : '정상'}>
                  Σ {sumA}A / 메인 {mainCapacity}A
                </span>
              );
            })()}
          </div>
          {breakers.length === 0 ? (
            <div className="p-6 text-center text-[12px] text-neutral-500 italic">차단기를 추가하세요. 위에서 종류/상/용량 선택 후 ＋ 버튼.</div>
          ) : (
            <div className="divide-y divide-white/5">
              <div className="grid grid-cols-[24px_70px_1fr_120px_100px_70px_60px] gap-1.5 px-3 py-1.5 text-[9.5px] uppercase tracking-wider text-neutral-500 font-semibold bg-black/30">
                <div></div>
                <div>OUT</div>
                <div>이름</div>
                <div>종류</div>
                <div>상 / 전압</div>
                <div className="text-right">용량 (A)</div>
                <div></div>
              </div>
              {breakers.map((b) => (
                <div key={b.id} className="grid grid-cols-[24px_70px_1fr_120px_100px_70px_60px] gap-1.5 items-center px-3 py-1.5 hover:bg-white/[0.02]">
                  <input
                    type="color"
                    value={b.color ?? '#06B6D4'}
                    onChange={e => updateBreaker(b.id, { color: e.target.value })}
                    className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                  />
                  <div className="text-[10.5px] font-mono text-emerald-300">{b.outputPort ?? '—'}</div>
                  <input
                    type="text"
                    value={b.name}
                    onChange={e => updateBreaker(b.id, { name: e.target.value })}
                    className="bg-neutral-900 border border-white/10 rounded px-2 py-1 text-[11px]"
                  />
                  <select
                    value={b.kind}
                    onChange={e => updateBreaker(b.id, { kind: e.target.value as BreakerKind })}
                    className="bg-neutral-900 border border-white/10 rounded px-1.5 py-1 text-[10.5px]"
                  >
                    <option value="MCCB">MCCB</option>
                    <option value="ELCB">ELCB</option>
                  </select>
                  <select
                    value={b.phase}
                    onChange={e => updateBreaker(b.id, { phase: e.target.value as PhaseType })}
                    className="bg-neutral-900 border border-white/10 rounded px-1.5 py-1 text-[10.5px]"
                  >
                    <option value="single">단상 220V</option>
                    <option value="three">3상 380V</option>
                  </select>
                  <select
                    value={b.capacityA}
                    onChange={e => {
                      const newCap = parseInt(e.target.value) as BreakerCapacity;
                      if (newCap > mainCapacity) {
                        alert(`부하측 차단기 용량 ${newCap}A는 메인 차단기 용량 ${mainCapacity}A보다 클 수 없습니다.`);
                        return;
                      }
                      updateBreaker(b.id, { capacityA: newCap });
                    }}
                    className="bg-neutral-900 border border-white/10 rounded px-1.5 py-1 text-[10.5px] text-right font-mono"
                  >
                    {BREAKER_CAPACITIES.map(c => (
                      <option key={c} value={c} disabled={c > mainCapacity}>
                        {c}A{c > mainCapacity ? ' ⛔' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => deleteBreaker(b.id)}
                    className="px-2 py-1 text-[10px] rounded bg-rose-500/15 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/30"
                  >삭제</button>
                </div>
              ))}
              {/* 합계 정보 */}
              {(() => {
                const sumA = breakers.reduce((s, b) => s + b.capacityA, 0);
                const sumW = breakers.reduce((s, b) => s + breakerCapacityWatts(b), 0);
                const overSum = sumA > mainCapacity;
                return (
                  <div className={`px-3 py-2 text-[10.5px] flex items-center justify-between ${
                    overSum ? 'bg-rose-500/10 text-rose-200' : 'bg-amber-500/5 text-amber-200/80'
                  }`}>
                    <span>{overSum ? '⚠ 부하측 합계가 메인 초과' : '부하측 차단 용량 합계'}</span>
                    <span className="font-mono font-bold">
                      {sumA}A {overSum && `> ${mainCapacity}A`} ({formatWatts(sumW)})
                    </span>
                  </div>
                );
              })()}
            </div>
          )}
        </section>

        <div className="text-[10.5px] text-neutral-500 bg-white/[0.02] border border-white/10 rounded p-3">
          💡 <strong>사용 흐름</strong>:<br/>
          1) 위에서 차단기 추가 → 자동으로 OUT-1, OUT-2... 포트가 생성됩니다.<br/>
          2) 도면에서 이 배전반의 각 OUT 포트를 <strong>전력 소비 장비</strong>의 IN 포트와 연결하세요.<br/>
          3) 전력 소비 장비 편집에서 와트 또는 암페어를 입력하면 자동으로 합산되어 차단기 부하가 계산됩니다.<br/>
          4) 차단기 용량을 초과하면 도면에서 <span className="text-rose-300 font-bold">빨갛게 깜박</span>입니다.
        </div>
      </div>
    </div>
  );
}

function BreakerAddGroup({ label, kind, mainCapacity, onAdd }: {
  label: string;
  kind: BreakerKind;
  mainCapacity: MainBreakerCapacity;
  onAdd: (k: BreakerKind, p: PhaseType, c: BreakerCapacity) => void;
}) {
  return (
    <div className={`rounded-lg p-2 border ${kind === 'MCCB' ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-rose-500/30 bg-rose-500/5'}`}>
      <div className={`text-[11px] font-bold mb-2 ${kind === 'MCCB' ? 'text-cyan-300' : 'text-rose-300'}`}>{label}</div>
      <div className="space-y-1.5">
        {(['single', 'three'] as PhaseType[]).map(phase => (
          <div key={phase}>
            <div className="text-[9.5px] text-neutral-500 mb-0.5">{PHASE_LABELS[phase]}</div>
            <div className="flex gap-1">
              {BREAKER_CAPACITIES.map(c => {
                const exceedsMain = c > mainCapacity;
                return (
                  <button
                    key={c}
                    onClick={() => onAdd(kind, phase, c)}
                    disabled={exceedsMain}
                    className={`flex-1 px-1.5 py-1 text-[10px] font-mono font-bold rounded border transition ${
                      exceedsMain
                        ? 'border-white/5 bg-white/[0.02] text-neutral-600 cursor-not-allowed'
                        : kind === 'MCCB'
                          ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/30 hover:scale-105'
                          : 'border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/30 hover:scale-105'
                    }`}
                    title={exceedsMain
                      ? `${c}A는 메인 ${mainCapacity}A 초과 — 선택 불가`
                      : `${kind} ${phase === 'single' ? '단상' : '3상'} ${c}A 추가`
                    }
                  >
                    {c}A{exceedsMain ? '⛔' : ''}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
