'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { supabase, Device, Connection, Layer, Rack } from '../lib/supabase';

type Props = {
  devices: Device[];
  connections: Connection[];
  layers: Layer[];
  racks: Rack[];
  onClose: () => void;
};

type DragState = {
  fromDeviceId: string;
  fromPortName: string;
  fromX: number;
  fromY: number;
  curX: number;
  curY: number;
};

const JACK_SIZE = 36;
const JACK_PAD = 3;
const RAIL_GAP = 20;
const LABEL_H = 14;
const RACK_UNIT_H = 44;    // 한 유닛당 높이(px)
const PATCHBAY_U = 2;      // 패치베이 1대가 차지하는 유닛 수

type Mode = 'single' | 'rack';

export default function PatchbayManager({ devices, connections, layers, racks, onClose }: Props) {
  const patchbays = useMemo(
    () => devices.filter(d => d.role === 'patchbay').sort((a, b) => a.name.localeCompare(b.name)),
    [devices]
  );

  const [mode, setMode] = useState<Mode>(patchbays.length > 0 && racks.length > 0 ? 'rack' : 'single');
  const [selectedId, setSelectedId] = useState<string>(patchbays[0]?.id ?? '');
  const [selectedRackId, setSelectedRackId] = useState<string>(racks[0]?.id ?? '');
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverTarget, setHoverTarget] = useState<{ deviceId: string; portName: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedRackId && racks[0]) setSelectedRackId(racks[0].id);
  }, [racks, selectedRackId]);

  const layerById = useMemo(() => new Map(layers.map(l => [l.id, l])), [layers]);
  const devById = useMemo(() => new Map(devices.map(d => [d.id, d])), [devices]);

  // -------- 랙 관리 --------
  const handleAddRack = async () => {
    const name = prompt('새 랙 이름:', `Rack ${racks.length + 1}`);
    if (!name) return;
    const id = `rack_${Date.now().toString(36)}`;
    const rack: Rack = { id, name: name.trim(), totalUnits: 42, sort_order: racks.length };
    await (supabase as any).from('racks').insert(rack);
    setSelectedRackId(id);
  };
  const handleRenameRack = async (rack: Rack) => {
    const name = prompt('랙 이름:', rack.name);
    if (!name || name === rack.name) return;
    await (supabase as any).from('racks').update({ name: name.trim() }).eq('id', rack.id);
  };
  const handleDeleteRack = async (rack: Rack) => {
    if (!confirm(`"${rack.name}" 랙 삭제? (소속 패치베이는 랙 해제됨)`)) return;
    const inRack = patchbays.filter(p => p.rackId === rack.id);
    await Promise.all(inRack.map(p =>
      (supabase as any).from('devices').update({ rackId: null, rackUnit: null }).eq('id', p.id)
    ));
    await (supabase as any).from('racks').delete().eq('id', rack.id);
    if (selectedRackId === rack.id) setSelectedRackId(racks.find(r => r.id !== rack.id)?.id ?? '');
  };
  const handleSetTotalUnits = async (rack: Rack) => {
    const v = prompt('전체 유닛 수 (4~64):', String(rack.totalUnits));
    if (!v) return;
    const n = Math.max(4, Math.min(64, parseInt(v, 10) || 42));
    await (supabase as any).from('racks').update({ totalUnits: n }).eq('id', rack.id);
  };

  const handleAssignToRack = async (pb: Device, rackId: string | null, unit: number | null) => {
    await (supabase as any).from('devices').update({
      rackId: rackId ?? null,
      rackUnit: unit ?? null,
    }).eq('id', pb.id);
  };
  const handleRemoveFromRack = async (pb: Device) => {
    await handleAssignToRack(pb, null, null);
  };

  // -------- 잭 드래그 --------
  const onJackMouseDown = (e: React.MouseEvent, deviceId: string, portName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag({
      fromDeviceId: deviceId,
      fromPortName: portName,
      fromX: e.clientX, fromY: e.clientY,
      curX: e.clientX, curY: e.clientY,
    });
  };

  const onAreaMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    setDrag({ ...drag, curX: e.clientX, curY: e.clientY });
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const inEl = el?.closest('[data-in-jack]');
    if (inEl) {
      const did = inEl.getAttribute('data-in-device')!;
      const pn = inEl.getAttribute('data-in-port')!;
      if (!(did === drag.fromDeviceId && pn === drag.fromPortName)) {
        setHoverTarget({ deviceId: did, portName: pn });
        return;
      }
    }
    if (hoverTarget) setHoverTarget(null);
  };

  const onAreaMouseUp = async (e: React.MouseEvent) => {
    if (!drag) { setHoverTarget(null); return; }
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const inEl = el?.closest('[data-in-jack]');
    if (inEl) {
      const toDev = inEl.getAttribute('data-in-device')!;
      const toPort = inEl.getAttribute('data-in-port')!;
      const fromDev = drag.fromDeviceId;
      const fromPort = drag.fromPortName;
      const isSameBox = fromDev === toDev;
      if (!(isSameBox && fromPort === toPort)) {
        const fromBox = devById.get(fromDev)!;
        const toBox = devById.get(toDev)!;
        const ct = fromBox?.outputsMeta?.[fromPort]?.connType ?? toBox?.inputsMeta?.[toPort]?.connType;

        // 동일 OUT에서 나가는 기존 connection 제거
        const existingFromOut = connections.find(c =>
          c.from_device === fromDev && c.from_port === fromPort
        );
        if (existingFromOut) {
          await (supabase as any).from('connections').delete().eq('id', existingFromOut.id);
        }
        // 동일 IN으로 오는 기존 connection 제거
        const existingToIn = connections.find(c =>
          c.to_device === toDev && c.to_port === toPort
        );
        if (existingToIn) {
          await (supabase as any).from('connections').delete().eq('id', existingToIn.id);
        }
        // 새 연결 생성
        // - 같은 박스(self-loop) = 패치 (is_patch=true, 도면엔 안 보임)
        // - 다른 박스 = 일반 connection (is_patch=false, 도면에도 보임) — "패치베이 간 연결"
        await (supabase as any).from('connections').insert({
          id: crypto.randomUUID(),
          from_device: fromDev, from_port: fromPort,
          to_device: toDev, to_port: toPort,
          conn_type: ct ?? null,
          is_patch: isSameBox,
        });
      }
    }
    setDrag(null);
    setHoverTarget(null);
  };

  // -------- 개별 패치베이 렌더 --------
  const renderPatchbay = (pb: Device, compact: boolean) => {
    const ports = Math.max(pb.inputs.length, pb.outputs.length);
    const jackW = compact ? JACK_SIZE : 42;
    const railW = ports * jackW;
    const patches = new Map<string, string>();
    connections
      .filter(c => c.from_device === pb.id && c.to_device === pb.id && c.is_patch)
      .forEach(c => patches.set(c.from_port, c.to_port));

    const cableFromOut = (port: string) => connections.find(c => c.from_device === pb.id && c.from_port === port);
    const cableIntoIn = (port: string) => connections.find(c => c.to_device === pb.id && c.to_port === port);

    return (
      <div
        className="relative rounded p-2"
        style={{
          background: 'linear-gradient(180deg, #2e2e32 0%, #1a1a1c 50%, #2e2e32 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.5)',
        }}
      >
        <div className="flex items-center justify-between mb-1.5 px-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`${compact ? 'text-[11px]' : 'text-[13px]'} font-bold text-white truncate`}>{pb.name}</div>
            {pb.model && <div className="text-[9px] font-mono text-neutral-500 truncate">{pb.model}</div>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="text-[8.5px] uppercase tracking-[0.15em] text-neutral-500 font-bold">{ports}CH · {PATCHBAY_U}U</div>
            <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-neutral-600 to-neutral-800 border border-black/50" style={{ boxShadow: 'inset 0 0.5px 0.5px rgba(255,255,255,0.2)' }}></div>
          </div>
        </div>

        <div className="relative rounded-sm p-2"
          style={{
            background: 'linear-gradient(180deg, #0a0a0c 0%, #111113 50%, #0a0a0c 100%)',
            boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.8)',
            border: '1px solid rgba(0,0,0,0.9)',
          }}
        >
          <div className="flex items-center mb-0.5" style={{ width: railW }}>
            <div className="text-[8px] font-bold tracking-[0.15em] text-teal-400/70 w-10 shrink-0">OUT ⬆</div>
            <div className="flex-1 h-px bg-gradient-to-r from-teal-400/30 to-transparent"></div>
          </div>

          <div className="flex" style={{ width: railW }}>
            {pb.outputs.map((portName, idx) => {
              const meta = pb.outputsMeta?.[portName];
              const layer = meta?.layerId ? layerById.get(meta.layerId) : undefined;
              const portColor = layer?.color ?? '#14b8a6';
              const isDragFrom = drag?.fromDeviceId === pb.id && drag.fromPortName === portName;
              const patched = patches.has(portName);
              const hasExt = !!cableFromOut(portName);
              return (
                <div
                  key={portName}
                  data-out-jack
                  data-out-device={pb.id}
                  data-out-port={portName}
                  onMouseDown={e => onJackMouseDown(e, pb.id, portName)}
                  className="relative flex flex-col items-center shrink-0 cursor-grab active:cursor-grabbing"
                  style={{ width: jackW, height: JACK_SIZE + LABEL_H }}
                  title={`${pb.name} OUT ${idx + 1}: ${portName}`}
                >
                  <div className="rounded-full transition-transform hover:scale-110 relative"
                    style={{
                      width: JACK_SIZE - JACK_PAD * 2, height: JACK_SIZE - JACK_PAD * 2, marginTop: 2,
                      background: `radial-gradient(circle at 35% 30%, ${patched || isDragFrom ? '#fb923c' : portColor} 25%, #000 85%)`,
                      boxShadow: `0 0 ${isDragFrom || patched ? '10px' : '5px'} ${patched || isDragFrom ? '#fb923c' : portColor}aa, inset 0 -1px 2px rgba(0,0,0,0.7), inset 0 1px 1.5px rgba(255,255,255,0.3)`,
                      border: `1px solid ${patched || isDragFrom ? '#f97316' : `${portColor}aa`}`,
                    }}
                  >
                    <div className="absolute inset-0 m-auto rounded-full" style={{ width: 8, height: 8, background: 'radial-gradient(circle, #000 35%, #0a0a0a 100%)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.95)' }}></div>
                    {hasExt && !patched && <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-sky-400 shadow shadow-sky-400/80"></div>}
                  </div>
                  <div className="text-[7.5px] font-mono font-bold text-neutral-400 mt-0.5 leading-none">
                    {String(idx + 1).padStart(2, '0')}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[7.5px] font-bold tracking-[0.15em] px-0.5 my-0.5"
            style={{ height: 10, color: 'rgba(20,184,166,0.55)' }}
          >
            <span>●</span>
            <span className="text-neutral-600 font-mono tracking-normal">{pb.outputs.length}/{pb.inputs.length}</span>
            <span>●</span>
          </div>

          <div className="flex" style={{ width: railW }}>
            {pb.inputs.map((portName, idx) => {
              const meta = pb.inputsMeta?.[portName];
              const layer = meta?.layerId ? layerById.get(meta.layerId) : undefined;
              const portColor = layer?.color ?? '#14b8a6';
              const isHoverDrop = drag && hoverTarget?.deviceId === pb.id && hoverTarget?.portName === portName;
              const patched = Array.from(patches.values()).includes(portName);
              const hasExt = !!cableIntoIn(portName);
              const hasNormal = pb.normals?.[portName];
              return (
                <div
                  key={portName}
                  data-in-jack
                  data-in-device={pb.id}
                  data-in-port={portName}
                  className="relative flex flex-col items-center shrink-0"
                  style={{ width: jackW, height: JACK_SIZE + LABEL_H }}
                  title={`${pb.name} IN ${idx + 1}: ${portName}${hasNormal ? ` · normal → ${hasNormal}` : ''}`}
                >
                  <div className="text-[7.5px] font-mono font-bold text-neutral-400 mb-0.5 leading-none mt-0.5">
                    {String(idx + 1).padStart(2, '0')}
                  </div>
                  <div className="rounded-full transition-transform hover:scale-110 relative"
                    style={{
                      width: JACK_SIZE - JACK_PAD * 2, height: JACK_SIZE - JACK_PAD * 2,
                      background: `radial-gradient(circle at 35% 30%, ${isHoverDrop || patched ? '#fb923c' : portColor} 25%, #000 85%)`,
                      boxShadow: `0 0 ${isHoverDrop || patched ? '14px' : '5px'} ${isHoverDrop || patched ? '#fb923c' : portColor}aa, inset 0 -1px 2px rgba(0,0,0,0.7), inset 0 1px 1.5px rgba(255,255,255,0.3)`,
                      border: `${isHoverDrop ? '2px' : '1px'} solid ${isHoverDrop || patched ? '#f97316' : `${portColor}aa`}`,
                      animation: isHoverDrop ? 'pulse 0.7s ease-in-out infinite' : undefined,
                    }}
                  >
                    <div className="absolute inset-0 m-auto rounded-full" style={{ width: 8, height: 8, background: 'radial-gradient(circle, #000 35%, #0a0a0a 100%)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.95)' }}></div>
                    {hasExt && !patched && <div className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-sky-400 shadow shadow-sky-400/80"></div>}
                    {hasNormal && !patched && !hasExt && <div className="absolute -bottom-0.5 -left-0.5 w-1 h-1 rounded-full bg-teal-400"></div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  if (patchbays.length === 0) {
    return (
      <div data-ui className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center">
        <div className="bg-neutral-900 border border-white/10 rounded-xl p-8 text-center max-w-md">
          <div className="text-neutral-400 mb-4">등록된 패치베이가 없습니다.</div>
          <button onClick={onClose} className="px-4 py-2 bg-sky-600 rounded text-sm">닫기</button>
        </div>
      </div>
    );
  }

  const rackPatchbays = patchbays.filter(p => p.rackId === selectedRackId).sort((a, b) =>
    (a.rackUnit ?? 0) - (b.rackUnit ?? 0)
  );
  const unassignedPatchbays = patchbays.filter(p => !p.rackId);
  const selectedRack = racks.find(r => r.id === selectedRackId);
  const singlePatchbay = patchbays.find(p => p.id === selectedId);

  return (
    <div ref={containerRef}
      data-ui
      className="fixed inset-0 z-50 bg-gradient-to-br from-neutral-950 via-black to-neutral-950 text-white overflow-hidden flex flex-col"
      onMouseMove={onAreaMouseMove}
      onMouseUp={onAreaMouseUp}
    >
      {/* Top bar */}
      <div className="h-14 border-b border-white/10 bg-black/60 backdrop-blur-xl flex items-center gap-3 px-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/30 text-sm">⊟</div>
          <div>
            <div className="text-[13px] font-bold leading-tight">패치베이 관리</div>
            <div className="text-[9.5px] text-neutral-500 font-mono leading-tight">Patchbay · Rack Console</div>
          </div>
        </div>

        <div className="w-px h-7 bg-white/10"></div>

        <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5 border border-white/10">
          <button onClick={() => setMode('rack')}
            className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition ${mode === 'rack' ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-500/30' : 'text-neutral-400 hover:text-white'}`}
          >🗄️ 랙 뷰</button>
          <button onClick={() => setMode('single')}
            className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition ${mode === 'single' ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-500/30' : 'text-neutral-400 hover:text-white'}`}
          >⊟ 개별 뷰</button>
        </div>

        <div className="w-px h-7 bg-white/10"></div>

        {mode === 'single' ? (
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10 overflow-x-auto max-w-2xl">
            {patchbays.map(p => {
              const active = p.id === selectedId;
              return (
                <button key={p.id} onClick={() => setSelectedId(p.id)}
                  className={`px-3 py-1 text-[11px] font-medium rounded-md transition whitespace-nowrap ${active ? 'bg-teal-500 text-white' : 'text-neutral-400 hover:text-white'}`}
                >{p.name}</button>
              );
            })}
          </div>
        ) : (
          <>
            <select value={selectedRackId} onChange={e => setSelectedRackId(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] focus:border-teal-500 focus:outline-none text-white min-w-40"
            >
              {racks.length === 0 && <option value="">(랙 없음)</option>}
              {racks.map(r => <option key={r.id} value={r.id}>{r.name} · {r.totalUnits}U</option>)}
            </select>
            <button onClick={handleAddRack}
              className="px-2.5 py-1.5 text-[11px] rounded-lg bg-teal-500/20 hover:bg-teal-500 text-teal-300 hover:text-white border border-teal-500/30 font-medium transition">
              ➕ 새 랙
            </button>
            {selectedRack && (
              <>
                <button onClick={() => handleRenameRack(selectedRack)}
                  className="px-2 py-1.5 text-[11px] rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white border border-white/10 transition" title="이름 변경">✎</button>
                <button onClick={() => handleSetTotalUnits(selectedRack)}
                  className="px-2 py-1.5 text-[11px] rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white border border-white/10 transition" title="유닛 수 설정">⇅ {selectedRack.totalUnits}U</button>
                <button onClick={() => handleDeleteRack(selectedRack)}
                  className="px-2 py-1.5 text-[11px] rounded-lg bg-white/5 hover:bg-rose-500/70 text-neutral-400 hover:text-white border border-white/10 transition" title="랙 삭제">🗑</button>
              </>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-3 text-[11px]">
          <span className="text-neutral-500 font-mono">
            <span className="text-teal-300">{patchbays.length}</span> patchbays ·
            <span className="text-fuchsia-300 ml-1">{racks.length}</span> racks
          </span>
          <button onClick={onClose} className="px-3 py-1 text-[11px] rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 transition">
            ✕ 닫기
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {mode === 'rack' ? (
          <>
            <aside className="w-64 border-r border-white/10 bg-black/40 overflow-y-auto p-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-bold mb-2">미배치 패치베이</div>
              {unassignedPatchbays.length === 0 && (
                <div className="text-[10px] text-neutral-600 italic">모두 배치됨</div>
              )}
              <div className="space-y-1.5">
                {unassignedPatchbays.map(pb => (
                  <div key={pb.id} className="bg-white/5 border border-white/10 rounded-md p-2">
                    <div className="text-[11px] font-bold text-white truncate">{pb.name}</div>
                    {pb.model && <div className="text-[9px] font-mono text-neutral-500 truncate">{pb.model}</div>}
                    <select
                      onChange={e => {
                        const rackId = e.target.value;
                        if (!rackId) return;
                        const rack = racks.find(r => r.id === rackId);
                        if (!rack) return;
                        const used = new Set<number>();
                        patchbays.filter(p => p.rackId === rackId).forEach(p => {
                          if (p.rackUnit) {
                            for (let i = 0; i < PATCHBAY_U; i++) used.add(p.rackUnit + i);
                          }
                        });
                        let unit = 1;
                        while (unit <= rack.totalUnits - PATCHBAY_U + 1) {
                          let ok = true;
                          for (let i = 0; i < PATCHBAY_U; i++) if (used.has(unit + i)) { ok = false; break; }
                          if (ok) break;
                          unit++;
                        }
                        handleAssignToRack(pb, rackId, unit);
                        e.target.value = '';
                      }}
                      className="mt-1.5 w-full bg-neutral-900 border border-white/10 rounded px-1.5 py-1 text-[10px] text-neutral-300"
                    >
                      <option value="">랙에 배치...</option>
                      {racks.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {racks.length === 0 && (
                <div className="mt-4 p-3 bg-teal-500/10 border border-teal-500/30 rounded-md text-[11px]">
                  <div className="text-teal-300 font-bold mb-1">💡 시작</div>
                  <div className="text-neutral-300 leading-relaxed text-[10px]">
                    상단 <b>➕ 새 랙</b>으로 가상 랙 생성
                  </div>
                </div>
              )}
            </aside>

            <div className="flex-1 overflow-auto p-6">
              {!selectedRack ? (
                <div className="h-full flex items-center justify-center text-neutral-500">
                  {racks.length === 0 ? '랙을 먼저 생성하세요' : '랙을 선택하세요'}
                </div>
              ) : (
                <div className="mx-auto" style={{ width: 'fit-content' }}>
                  <div className="relative rounded-lg p-4"
                    style={{
                      background: 'linear-gradient(180deg, #35352a 0%, #1f1f18 45%, #0a0a05 55%, #1f1f18 100%)',
                      border: '2px solid rgba(255,255,255,0.1)',
                      boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.1), inset 0 -2px 0 rgba(0,0,0,0.8), 0 20px 60px rgba(0,0,0,0.7)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-3 px-2 pb-2 border-b border-white/10">
                      <div>
                        <div className="text-[15px] font-bold tracking-tight">{selectedRack.name}</div>
                        <div className="text-[10px] text-neutral-400 font-mono">{selectedRack.totalUnits}U · {rackPatchbays.length} patchbays</div>
                      </div>
                      <div className="flex gap-2">
                        <div className="w-4 h-4 rounded-full bg-gradient-to-br from-neutral-500 to-neutral-700 border border-black/60" style={{ boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.2)' }}></div>
                        <div className="w-4 h-4 rounded-full bg-gradient-to-br from-neutral-500 to-neutral-700 border border-black/60" style={{ boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.2)' }}></div>
                      </div>
                    </div>

                    <div className="relative flex" style={{ width: 1020 }}>
                      {/* 유닛 번호 레일 */}
                      <div className="flex flex-col shrink-0" style={{ width: 32 }}>
                        {Array.from({ length: selectedRack.totalUnits }).map((_, i) => (
                          <div key={i} className="flex items-center justify-center text-[8.5px] font-mono text-neutral-600 border-b border-white/5"
                            style={{ height: RACK_UNIT_H }}
                          >
                            {i + 1}U
                          </div>
                        ))}
                      </div>
                      {/* 메인 영역 */}
                      <div className="flex-1 relative"
                        style={{
                          background: 'linear-gradient(180deg, #0e0e10, #060608)',
                          border: '1px solid rgba(0,0,0,0.9)',
                          height: selectedRack.totalUnits * RACK_UNIT_H,
                        }}
                      >
                        {/* 유닛 경계선 */}
                        {Array.from({ length: selectedRack.totalUnits - 1 }).map((_, i) => (
                          <div key={i} className="absolute left-0 right-0"
                            style={{ top: (i + 1) * RACK_UNIT_H, borderTop: '1px dashed rgba(255,255,255,0.04)' }}></div>
                        ))}

                        {rackPatchbays.map(pb => {
                          const unit = pb.rackUnit ?? 1;
                          const top = (unit - 1) * RACK_UNIT_H;
                          return (
                            <div key={pb.id} className="absolute left-1 right-1"
                              style={{ top, height: PATCHBAY_U * RACK_UNIT_H, zIndex: 5 }}
                            >
                              <div className="relative group h-full">
                                {renderPatchbay(pb, true)}
                                <div className="absolute -right-0 top-0 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition">
                                  <button onClick={() => {
                                    const v = prompt(`유닛 번호 (1-${(selectedRack.totalUnits - PATCHBAY_U + 1)}):`, String(unit));
                                    if (!v) return;
                                    const n = Math.max(1, Math.min(selectedRack.totalUnits - PATCHBAY_U + 1, parseInt(v, 10) || unit));
                                    handleAssignToRack(pb, selectedRack.id, n);
                                  }}
                                    className="text-[8px] px-1 py-0.5 rounded bg-black/80 text-neutral-300 hover:bg-teal-500 hover:text-white font-mono"
                                    title="유닛 위치 변경">U{unit}</button>
                                  <button onClick={() => handleRemoveFromRack(pb)}
                                    className="text-[8px] px-1 py-0.5 rounded bg-black/80 text-neutral-300 hover:bg-rose-500 hover:text-white font-mono"
                                    title="랙에서 제거">✕</button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-3 px-1 text-[9px] text-neutral-500 font-mono flex items-center justify-between">
                      <span>💡 OUT 잭에서 다른 패치베이 IN 잭으로 드래그 → 랙 간 연결 (도면에도 반영)</span>
                      <span><span className="text-orange-400">●</span> 패치 <span className="text-sky-400">●</span> 외부연결 <span className="text-teal-400">●</span> Normal</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-auto p-6">
            {singlePatchbay && (
              <div className="mx-auto" style={{ width: 'fit-content' }}>
                {renderPatchbay(singlePatchbay, false)}
              </div>
            )}
          </div>
        )}
      </div>

      {drag && (
        <svg className="fixed inset-0 pointer-events-none z-[70]" width="100%" height="100%">
          <path
            d={`M ${drag.fromX} ${drag.fromY} Q ${(drag.fromX + drag.curX) / 2} ${Math.max(drag.fromY, drag.curY) + 30}, ${drag.curX} ${drag.curY}`}
            stroke="#F97316" strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray="6 4"
            style={{ filter: 'drop-shadow(0 0 4px rgba(249,115,22,0.7))' }}
          />
          <circle cx={drag.curX} cy={drag.curY} r="5" fill="#F97316" opacity="0.85" />
        </svg>
      )}
    </div>
  );
}
