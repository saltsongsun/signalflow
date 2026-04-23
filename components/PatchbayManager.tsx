'use client';
import { useState, useMemo } from 'react';
import { supabase, Device, Connection, Layer, ConnectionType } from '../lib/supabase';

type Props = {
  devices: Device[];
  connections: Connection[];
  layers: Layer[];
  onClose: () => void;
};

type DragState = {
  fromPortName: string;  // OUT 포트 이름
  fromX: number;         // 시작 화면 좌표 (clientX)
  fromY: number;
  curX: number;
  curY: number;
};

const JACK_SIZE = 42;       // 잭 셀 한 변
const JACK_PAD = 4;
const RAIL_GAP = 24;        // OUT 행과 IN 행 사이 간격
const LABEL_H = 18;

export default function PatchbayManager({ devices, connections, layers, onClose }: Props) {
  const patchbays = useMemo(
    () => devices.filter(d => d.role === 'patchbay').sort((a, b) => a.name.localeCompare(b.name)),
    [devices]
  );

  const [selectedId, setSelectedId] = useState<string>(patchbays[0]?.id ?? '');
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverTarget, setHoverTarget] = useState<{ portName: string } | null>(null);

  const selected = patchbays.find(p => p.id === selectedId);
  const layerById = useMemo(() => new Map(layers.map(l => [l.id, l])), [layers]);
  const devById = useMemo(() => new Map(devices.map(d => [d.id, d])), [devices]);

  // 이 패치베이에 연결된 외부 케이블들 조회
  const cablesIn = useMemo(() => {
    if (!selected) return new Map<string, Connection>();
    const m = new Map<string, Connection>();
    connections.filter(c => c.to_device === selected.id).forEach(c => m.set(c.to_port, c));
    return m;
  }, [connections, selected]);

  const cablesOut = useMemo(() => {
    if (!selected) return new Map<string, Connection>();
    const m = new Map<string, Connection>();
    connections.filter(c => c.from_device === selected.id).forEach(c => m.set(c.from_port, c));
    return m;
  }, [connections, selected]);

  // 패치 케이블: OUT 포트 → IN 포트 (같은 패치베이 내부에서 is_patch=true인 경우 처리 방식)
  // 여기서는 "패치"를 단순하게 장비 내 OUT-IN 간 매핑으로 취급 (실제 데이터는 Connection이 아니라 
  // 별도 저장). 하지만 기존 구조에서 연결을 만들려면 self-loop connection이 됨.
  // 깔끔하게 하려면: is_patch=true인 self-loop connection으로 저장.
  const patches = useMemo(() => {
    if (!selected) return new Map<string, string>(); // OUT port -> IN port
    const m = new Map<string, string>();
    connections
      .filter(c => c.from_device === selected.id && c.to_device === selected.id && c.is_patch)
      .forEach(c => m.set(c.from_port, c.to_port));
    return m;
  }, [connections, selected]);

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

  if (!selected) return null;

  // 드래그 기능
  const onJackMouseDown = (e: React.MouseEvent, portName: string, isOutJack: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOutJack) return; // OUT 잭에서만 드래그 시작
    setDrag({
      fromPortName: portName,
      fromX: e.clientX, fromY: e.clientY,
      curX: e.clientX, curY: e.clientY,
    });
  };

  const onAreaMouseMove = (e: React.MouseEvent) => {
    if (drag) setDrag({ ...drag, curX: e.clientX, curY: e.clientY });
  };

  const onJackMouseEnter = (portName: string, isOutJack: boolean) => {
    if (drag && !isOutJack) {
      setHoverTarget({ portName });
    }
  };
  const onJackMouseLeave = () => setHoverTarget(null);

  const onAreaMouseUp = async (e: React.MouseEvent) => {
    if (!drag) return;
    const target = (e.target as HTMLElement).closest('[data-in-port]');
    if (target && selected) {
      const toPort = target.getAttribute('data-in-port')!;
      // 동일 OUT에서의 기존 패치 제거 (OUT은 하나의 IN에만 꽂힘)
      const oldFromThis = Array.from(patches.entries()).find(([out]) => out === drag.fromPortName);
      if (oldFromThis) {
        const old = connections.find(c =>
          c.from_device === selected.id && c.to_device === selected.id &&
          c.from_port === oldFromThis[0] && c.to_port === oldFromThis[1] && c.is_patch
        );
        if (old) await (supabase as any).from('connections').delete().eq('id', old.id);
      }
      // 동일 IN으로 이미 오는 패치 제거 (IN도 하나만)
      const oldToThis = connections.find(c =>
        c.from_device === selected.id && c.to_device === selected.id &&
        c.to_port === toPort && c.is_patch
      );
      if (oldToThis) await (supabase as any).from('connections').delete().eq('id', oldToThis.id);

      // 새 패치 케이블 생성 (self-loop, is_patch=true)
      const ct = selected.outputsMeta?.[drag.fromPortName]?.connType ?? selected.inputsMeta?.[toPort]?.connType;
      await (supabase as any).from('connections').insert({
        id: crypto.randomUUID(),
        from_device: selected.id, from_port: drag.fromPortName,
        to_device: selected.id, to_port: toPort,
        conn_type: ct ?? null,
        is_patch: true,
      });
    }
    setDrag(null);
    setHoverTarget(null);
  };

  const removePatch = async (outPort: string) => {
    if (!selected) return;
    const toPort = patches.get(outPort);
    if (!toPort) return;
    const conn = connections.find(c =>
      c.from_device === selected.id && c.to_device === selected.id &&
      c.from_port === outPort && c.to_port === toPort && c.is_patch
    );
    if (conn) await (supabase as any).from('connections').delete().eq('id', conn.id);
  };

  const clearAllPatches = async () => {
    if (!selected) return;
    if (!confirm('이 패치베이의 모든 패치 케이블을 제거합니다.')) return;
    const ids = connections
      .filter(c => c.from_device === selected.id && c.to_device === selected.id && c.is_patch)
      .map(c => c.id);
    for (const id of ids) await (supabase as any).from('connections').delete().eq('id', id);
  };

  // 레이아웃 계산 - 전체 화면폭에 맞게 잭 크기 조정
  const ports = Math.max(selected.inputs.length, selected.outputs.length);
  const railW = ports * JACK_SIZE;

  // 외부 소스 장비명 구하기
  const externalSource = (inPort: string): string | null => {
    const c = cablesIn.get(inPort);
    if (!c) return null;
    const dev = devById.get(c.from_device);
    return dev ? `${dev.name} · ${c.from_port}` : null;
  };
  const externalDest = (outPort: string): string | null => {
    const c = cablesOut.get(outPort);
    if (!c) return null;
    const dev = devById.get(c.to_device);
    return dev ? `${dev.name} · ${c.to_port}` : null;
  };

  return (
    <div
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
            <div className="text-[9.5px] text-neutral-500 font-mono leading-tight">Patchbay Console</div>
          </div>
        </div>
        <div className="w-px h-7 bg-white/10"></div>

        {/* 패치베이 선택 탭 */}
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10">
          {patchbays.map(p => {
            const active = p.id === selectedId;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition ${active ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-500/30' : 'text-neutral-400 hover:text-white'}`}
              >
                {p.name}
                {p.model && <span className="ml-1.5 text-[9px] opacity-60 font-mono">{p.model}</span>}
              </button>
            );
          })}
        </div>

        <button onClick={clearAllPatches}
          className="px-3 py-1 text-[11px] rounded-lg bg-white/5 hover:bg-rose-500/70 text-neutral-400 hover:text-white border border-white/10 transition">
          🧹 패치 전체 해제
        </button>

        <div className="ml-auto flex items-center gap-2 text-[11px]">
          <span className="text-neutral-500 font-mono">{patches.size} patches · {cablesIn.size} in / {cablesOut.size} out</span>
          <button onClick={onClose} className="ml-2 px-3 py-1 text-[11px] rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 transition">
            ✕ 닫기
          </button>
        </div>
      </div>

      {/* Meta strip */}
      <div className="px-6 py-2.5 bg-black/40 border-b border-white/5 flex items-center gap-4 text-[11px]">
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-sm shadow-orange-500/60"></div><span className="text-neutral-400">Patch 케이블</span><span className="text-neutral-600 font-mono">({patches.size})</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-teal-400 shadow-sm shadow-teal-400/60"></div><span className="text-neutral-400">Normal (기본배선)</span><span className="text-neutral-600 font-mono">({selected.normals ? Object.keys(selected.normals).length : 0})</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-sky-400"></div><span className="text-neutral-400">외부 소스 연결</span><span className="text-neutral-600 font-mono">IN {cablesIn.size} / OUT {cablesOut.size}</span></div>
        <div className="ml-auto text-neutral-500 font-mono text-[10px]">
          💡 상단 OUT 잭을 하단 IN 잭으로 드래그 → 패치 케이블
        </div>
      </div>

      {/* Main area - 패치베이 렌더링 */}
      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto" style={{ width: 'fit-content' }}>
          {/* 1U 금속 러그 프레임 */}
          <div
            className="relative rounded-md p-5"
            style={{
              background: 'linear-gradient(180deg, #2a2a2f 0%, #1a1a1c 45%, #0e0e10 55%, #1a1a1c 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.6), 0 10px 30px rgba(0,0,0,0.6)',
            }}
          >
            {/* 러그 헤더 (브랜드 라벨) */}
            <div className="flex items-center justify-between mb-4 px-1">
              <div>
                <div className="text-[15px] font-bold tracking-tight text-white">{selected.name}</div>
                {selected.model && <div className="text-[11px] font-mono text-neutral-400">{selected.model}</div>}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-[9px] uppercase tracking-[0.2em] text-neutral-500 font-bold">{ports} channels</div>
                {/* 좌우 나사 */}
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-gradient-to-br from-neutral-600 to-neutral-800 border border-black/60" style={{ boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.2)' }}><div className="w-full h-full flex items-center justify-center text-[8px] text-neutral-900">⊕</div></div>
                </div>
              </div>
            </div>

            {/* 패치베이 잭 영역 */}
            <div
              className="relative rounded-sm p-3"
              style={{
                background: 'linear-gradient(180deg, #0a0a0c 0%, #111113 50%, #0a0a0c 100%)',
                border: '1px solid rgba(0,0,0,0.8)',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)',
              }}
            >
              {/* 상단 라벨 스트립 - OUT */}
              <div className="flex items-center mb-1" style={{ width: railW }}>
                <div className="text-[9px] font-bold tracking-[0.15em] text-teal-400/80 shrink-0 w-12">OUT ⬆</div>
                <div className="flex-1 h-px bg-gradient-to-r from-teal-400/40 via-teal-400/10 to-transparent"></div>
              </div>

              {/* OUT 잭 행 */}
              <div className="flex" style={{ width: railW }}>
                {selected.outputs.map((portName, idx) => {
                  const meta = selected.outputsMeta?.[portName];
                  const layer = meta?.layerId ? layerById.get(meta.layerId) : undefined;
                  const portColor = layer?.color ?? '#14b8a6';
                  const isDragFrom = drag?.fromPortName === portName;
                  const hasOutCable = cablesOut.has(portName);
                  const isPatched = patches.has(portName);
                  const extDest = externalDest(portName);
                  const isPgm = selected.role === 'switcher' && selected.pgmPort === portName;
                  return (
                    <div
                      key={portName}
                      data-out-port={portName}
                      onMouseDown={e => onJackMouseDown(e, portName, true)}
                      className="relative flex flex-col items-center cursor-grab active:cursor-grabbing shrink-0"
                      style={{ width: JACK_SIZE, height: JACK_SIZE + LABEL_H }}
                      title={`OUT ${idx + 1}: ${portName}${meta?.label ? ` — ${meta.label}` : ''}${extDest ? `\n→ ${extDest}` : ''}`}
                    >
                      {/* 번호 */}
                      <div className="text-[8.5px] font-mono font-bold text-neutral-500 mb-0.5 leading-none" style={{ height: LABEL_H - 4 }}>
                        {String(idx + 1).padStart(2, '0')}
                      </div>
                      {/* 잭 소켓 (더 크게, 실사적) */}
                      <div
                        className="relative rounded-full transition-transform hover:scale-110"
                        style={{
                          width: JACK_SIZE - JACK_PAD * 2,
                          height: JACK_SIZE - JACK_PAD * 2,
                          background: `radial-gradient(circle at 35% 30%, ${isPatched || isDragFrom ? '#fb923c' : portColor} 25%, #000 85%)`,
                          boxShadow: `
                            0 0 ${isDragFrom || isPatched ? '12px' : '6px'} ${isPatched || isDragFrom ? '#fb923c' : portColor}aa,
                            inset 0 -2px 3px rgba(0,0,0,0.7),
                            inset 0 2px 2px rgba(255,255,255,0.25)
                          `,
                          border: `1.5px solid ${isPatched || isDragFrom ? '#f97316' : `${portColor}cc`}`,
                        }}
                      >
                        {/* 잭 구멍 */}
                        <div
                          className="absolute inset-0 m-auto rounded-full"
                          style={{
                            width: 10, height: 10,
                            background: 'radial-gradient(circle, #000 30%, #0a0a0a 70%, #1a1a1a 100%)',
                            boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.95), inset 0 -1px 1px rgba(255,255,255,0.08)',
                          }}
                        ></div>
                        {/* 외부 연결 인디케이터 */}
                        {hasOutCable && !isPatched && (
                          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-sky-400 shadow shadow-sky-400/80"></div>
                        )}
                        {isPgm && (
                          <div className="absolute -top-1 -left-0.5 text-[8px] font-bold text-emerald-400 leading-none">★</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 내부 패치 케이블 SVG 오버레이 */}
              <svg
                className="pointer-events-none absolute"
                style={{
                  left: 12,
                  top: 12 + LABEL_H + (JACK_SIZE - JACK_PAD * 2) + 5,  // OUT 잭 하단부터
                  width: railW,
                  height: RAIL_GAP + LABEL_H + 10,
                }}
              >
                {Array.from(patches.entries()).map(([outPort, inPort]) => {
                  const outIdx = selected.outputs.indexOf(outPort);
                  const inIdx = selected.inputs.indexOf(inPort);
                  if (outIdx < 0 || inIdx < 0) return null;
                  const x1 = outIdx * JACK_SIZE + JACK_SIZE / 2;
                  const y1 = 0;
                  const x2 = inIdx * JACK_SIZE + JACK_SIZE / 2;
                  const y2 = RAIL_GAP + LABEL_H + 4;
                  const sag = Math.max(10, Math.abs(x2 - x1) / 6); // 중력 sag
                  const midY = (y1 + y2) / 2 + sag;
                  return (
                    <g key={`${outPort}-${inPort}`}>
                      {/* 케이블 그림자 */}
                      <path
                        d={`M ${x1} ${y1} Q ${(x1 + x2) / 2} ${midY + 3}, ${x2} ${y2}`}
                        stroke="rgba(0,0,0,0.6)" strokeWidth="6" fill="none" strokeLinecap="round"
                      />
                      {/* 케이블 본체 */}
                      <path
                        d={`M ${x1} ${y1} Q ${(x1 + x2) / 2} ${midY}, ${x2} ${y2}`}
                        stroke="#F97316" strokeWidth="3.5" fill="none" strokeLinecap="round"
                        style={{ filter: 'drop-shadow(0 0 3px rgba(249,115,22,0.5))' }}
                      />
                      {/* 하이라이트 */}
                      <path
                        d={`M ${x1} ${y1} Q ${(x1 + x2) / 2} ${midY}, ${x2} ${y2}`}
                        stroke="rgba(255,255,255,0.25)" strokeWidth="1" fill="none" strokeLinecap="round"
                      />
                    </g>
                  );
                })}
                {/* 드래그 중 미리보기 - area 기준 좌표 필요 */}
              </svg>

              {/* 중앙 레일 공백 */}
              <div style={{ height: RAIL_GAP }}></div>

              {/* 하단 라벨 스트립 - IN */}
              <div className="flex items-center mt-1" style={{ width: railW }}>
                <div className="text-[9px] font-bold tracking-[0.15em] text-teal-400/80 shrink-0 w-12">IN ⬇</div>
                <div className="flex-1 h-px bg-gradient-to-r from-teal-400/40 via-teal-400/10 to-transparent"></div>
              </div>

              {/* IN 잭 행 */}
              <div className="flex" style={{ width: railW }}>
                {selected.inputs.map((portName, idx) => {
                  const meta = selected.inputsMeta?.[portName];
                  const layer = meta?.layerId ? layerById.get(meta.layerId) : undefined;
                  const portColor = layer?.color ?? '#14b8a6';
                  const isDropTarget = drag && hoverTarget?.portName === portName;
                  const isPatched = Array.from(patches.values()).includes(portName);
                  const hasInCable = cablesIn.has(portName);
                  const extSrc = externalSource(portName);
                  const hasNormal = selected.normals?.[portName];
                  return (
                    <div
                      key={portName}
                      data-in-port={portName}
                      onMouseEnter={() => onJackMouseEnter(portName, false)}
                      onMouseLeave={onJackMouseLeave}
                      className="relative flex flex-col items-center shrink-0"
                      style={{ width: JACK_SIZE, height: JACK_SIZE + LABEL_H }}
                      title={`IN ${idx + 1}: ${portName}${meta?.label ? ` — ${meta.label}` : ''}${extSrc ? `\n← ${extSrc}` : ''}${hasNormal ? `\nNormal → ${hasNormal}` : ''}`}
                    >
                      {/* 잭 소켓 */}
                      <div
                        className="relative rounded-full transition-transform hover:scale-110"
                        style={{
                          width: JACK_SIZE - JACK_PAD * 2,
                          height: JACK_SIZE - JACK_PAD * 2,
                          background: `radial-gradient(circle at 35% 30%, ${isPatched || isDropTarget ? '#fb923c' : portColor} 25%, #000 85%)`,
                          boxShadow: `
                            0 0 ${isDropTarget || isPatched ? '14px' : '6px'} ${isPatched || isDropTarget ? '#fb923c' : portColor}aa,
                            inset 0 -2px 3px rgba(0,0,0,0.7),
                            inset 0 2px 2px rgba(255,255,255,0.25)
                          `,
                          border: `${isDropTarget ? '2.5px' : '1.5px'} solid ${isPatched || isDropTarget ? '#f97316' : `${portColor}cc`}`,
                          animation: isDropTarget ? 'pulse 0.8s ease-in-out infinite' : undefined,
                        }}
                      >
                        <div
                          className="absolute inset-0 m-auto rounded-full"
                          style={{
                            width: 10, height: 10,
                            background: 'radial-gradient(circle, #000 30%, #0a0a0a 70%, #1a1a1a 100%)',
                            boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.95)',
                          }}
                        ></div>
                        {hasInCable && !isPatched && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-sky-400 shadow shadow-sky-400/80"></div>
                        )}
                        {hasNormal && !isPatched && !hasInCable && (
                          <div className="absolute -bottom-0.5 -left-0.5 w-1.5 h-1.5 rounded-full bg-teal-400"></div>
                        )}
                      </div>
                      {/* 번호 */}
                      <div className="text-[8.5px] font-mono font-bold text-neutral-500 mt-0.5 leading-none" style={{ height: LABEL_H - 4 }}>
                        {String(idx + 1).padStart(2, '0')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 하단 라벨 */}
            <div className="mt-2 px-1 text-[9px] font-mono text-neutral-600 flex items-center justify-between">
              <span>💡 상단(OUT) 잭에서 하단(IN) 잭으로 드래그하면 패치 케이블 연결</span>
              <span className="text-teal-500/70">● Normal · <span className="text-sky-400">●</span> 외부케이블 · <span className="text-orange-400">●</span> 수동 패치</span>
            </div>
          </div>

          {/* 상세 테이블 */}
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-white/10 bg-teal-500/10 text-[11px] font-bold tracking-wider uppercase">OUT 포트 ({selected.outputs.length})</div>
              <div className="max-h-80 overflow-y-auto custom-scroll">
                {selected.outputs.map((p, i) => {
                  const meta = selected.outputsMeta?.[p];
                  const extDest = externalDest(p);
                  const patchTo = patches.get(p);
                  return (
                    <div key={p} className="px-3 py-1.5 border-b border-white/5 text-[11px] flex items-center gap-2 hover:bg-white/5">
                      <span className="font-mono text-neutral-500 w-6 text-right">{i + 1}.</span>
                      <span className="font-mono text-neutral-200 w-16 truncate">{p}</span>
                      {meta?.label && <span className="text-[10px] text-neutral-500 truncate flex-1">{meta.label}</span>}
                      {meta?.connType && <span className="text-[9px] px-1 rounded bg-white/5 text-neutral-400 font-mono shrink-0">{meta.connType}</span>}
                      {patchTo && (
                        <button onClick={() => removePatch(p)}
                          className="text-[9px] px-1.5 rounded bg-orange-500/20 text-orange-300 hover:bg-orange-500 hover:text-white font-mono shrink-0 transition"
                          title="패치 해제">
                          PATCH → {patchTo} ✕
                        </button>
                      )}
                      {extDest && <span className="text-[9px] px-1 rounded bg-sky-500/20 text-sky-300 font-mono shrink-0 truncate max-w-40" title={extDest}>→ {extDest}</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-white/10 bg-teal-500/10 text-[11px] font-bold tracking-wider uppercase">IN 포트 ({selected.inputs.length})</div>
              <div className="max-h-80 overflow-y-auto custom-scroll">
                {selected.inputs.map((p, i) => {
                  const meta = selected.inputsMeta?.[p];
                  const extSrc = externalSource(p);
                  const normalOut = selected.normals?.[p];
                  const patchedFrom = Array.from(patches.entries()).find(([, ip]) => ip === p)?.[0];
                  return (
                    <div key={p} className="px-3 py-1.5 border-b border-white/5 text-[11px] flex items-center gap-2 hover:bg-white/5">
                      <span className="font-mono text-neutral-500 w-6 text-right">{i + 1}.</span>
                      <span className="font-mono text-neutral-200 w-16 truncate">{p}</span>
                      {meta?.label && <span className="text-[10px] text-neutral-500 truncate flex-1">{meta.label}</span>}
                      {meta?.connType && <span className="text-[9px] px-1 rounded bg-white/5 text-neutral-400 font-mono shrink-0">{meta.connType}</span>}
                      {patchedFrom && <span className="text-[9px] px-1.5 rounded bg-orange-500/20 text-orange-300 font-mono shrink-0">← PATCH {patchedFrom}</span>}
                      {normalOut && !patchedFrom && <span className="text-[9px] px-1 rounded bg-teal-500/20 text-teal-300 font-mono shrink-0">norm → {normalOut}</span>}
                      {extSrc && <span className="text-[9px] px-1 rounded bg-sky-500/20 text-sky-300 font-mono shrink-0 truncate max-w-40" title={extSrc}>← {extSrc}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 드래그 중 케이블 프리뷰 - fixed 위치 */}
      {drag && (
        <svg className="fixed inset-0 pointer-events-none z-[70]" width="100%" height="100%">
          <path
            d={`M ${drag.fromX} ${drag.fromY} Q ${(drag.fromX + drag.curX) / 2} ${Math.max(drag.fromY, drag.curY) + 40}, ${drag.curX} ${drag.curY}`}
            stroke="#F97316" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeDasharray="6 4"
            style={{ filter: 'drop-shadow(0 0 4px rgba(249,115,22,0.7))' }}
          />
          <circle cx={drag.curX} cy={drag.curY} r="6" fill="#F97316" opacity="0.8" />
        </svg>
      )}
    </div>
  );
}
