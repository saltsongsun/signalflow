'use client';
import { useMemo, useState } from 'react';
import { Device, Connection, Layer, CONNECTION_TYPES } from '../lib/supabase';

type Props = {
  devices: Device[];
  connections: Connection[];
  layers: Layer[];
  onClose: () => void;
  onEditDevice: (device: Device) => void;
};

export default function WallboxManager({ devices, connections, layers, onClose, onEditDevice }: Props) {
  const [filter, setFilter] = useState('');
  const [connFilter, setConnFilter] = useState<string>(''); // 연결방식 필터

  const wallboxes = useMemo(
    () => devices.filter(d => d.role === 'wallbox').sort((a, b) => {
      const la = a.location ?? '_';
      const lb = b.location ?? '_';
      if (la !== lb) return la.localeCompare(lb);
      return a.name.localeCompare(b.name);
    }),
    [devices]
  );

  // 장소별 그룹핑
  const groups = useMemo(() => {
    const m = new Map<string, Device[]>();
    wallboxes.forEach(wb => {
      const loc = wb.location || '(장소 미지정)';
      const arr = m.get(loc) ?? [];
      arr.push(wb);
      m.set(loc, arr);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [wallboxes]);

  const layerById = useMemo(() => new Map(layers.map(l => [l.id, l])), [layers]);
  const devById = useMemo(() => new Map(devices.map(d => [d.id, d])), [devices]);

  // 월박스 포트별 외부 연결
  const connsFromDevice = (id: string) => connections.filter(c => c.from_device === id);
  const connsToDevice = (id: string) => connections.filter(c => c.to_device === id);

  // 필터 매칭
  const matchFilter = (wb: Device) => {
    if (!filter && !connFilter) return true;
    const hay = `${wb.name} ${wb.model ?? ''} ${wb.location ?? ''} ${wb.roomNumber ?? ''}`.toLowerCase();
    if (filter && !hay.includes(filter.toLowerCase())) return false;
    if (connFilter) {
      const hasConn = [...wb.inputs, ...wb.outputs].some(p => {
        const im = wb.inputsMeta?.[p]?.connType;
        const om = wb.outputsMeta?.[p]?.connType;
        return im === connFilter || om === connFilter;
      });
      if (!hasConn) return false;
    }
    return true;
  };

  const totalPorts = wallboxes.reduce((s, w) => s + w.inputs.length + w.outputs.length, 0);
  const totalConnected = wallboxes.reduce((s, w) => {
    const c = connsFromDevice(w.id).length + connsToDevice(w.id).length;
    return s + c;
  }, 0);

  if (wallboxes.length === 0) {
    return (
      <div data-ui className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center">
        <div className="bg-neutral-900 border border-white/10 rounded-xl p-8 text-center max-w-md">
          <div className="text-[14px] text-amber-200 mb-2 font-semibold">▦ 등록된 월박스가 없습니다</div>
          <div className="text-[11px] text-neutral-500 mb-4">
            장비 편집에서 역할을 <b>월박스</b>로 설정하면 여기 표시됩니다.
          </div>
          <button onClick={onClose} className="px-4 py-2 bg-amber-600 rounded text-sm hover:bg-amber-500 transition">닫기</button>
        </div>
      </div>
    );
  }

  return (
    <div data-ui className="fixed inset-0 z-50 bg-gradient-to-br from-neutral-950 via-black to-neutral-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="h-14 border-b border-white/10 bg-black/60 backdrop-blur-xl flex items-center gap-3 px-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30 text-sm">▦</div>
          <div>
            <div className="text-[13px] font-bold leading-tight">월박스 관리</div>
            <div className="text-[9.5px] text-neutral-500 font-mono leading-tight">Wallbox Console</div>
          </div>
        </div>
        <div className="w-px h-7 bg-white/10"></div>

        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="🔍 이름/장소/방번호 검색"
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] w-56 focus:border-amber-500/50 focus:outline-none text-neutral-200"
        />
        <select
          value={connFilter}
          onChange={e => setConnFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] focus:border-amber-500/50 focus:outline-none text-neutral-200"
        >
          <option value="">모든 연결방식</option>
          {CONNECTION_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="ml-auto flex items-center gap-3 text-[11px]">
          <span className="text-neutral-500 font-mono">
            <span className="text-amber-300">{wallboxes.length}</span> 월박스 ·
            <span className="text-neutral-300 ml-1">{groups.length}</span> 장소 ·
            <span className="text-neutral-300 ml-1">{totalPorts}</span> 포트 ·
            <span className="text-sky-300 ml-1">{totalConnected}</span> 연결
          </span>
          <button onClick={onClose} className="px-3 py-1 text-[11px] rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 transition">
            ✕ 닫기
          </button>
        </div>
      </div>

      {/* 장소별 그룹 목록 */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {groups.map(([location, boxes]) => {
            const visibleBoxes = boxes.filter(matchFilter);
            if (visibleBoxes.length === 0 && (filter || connFilter)) return null;
            return (
              <section key={location}>
                {/* 장소 헤더 */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2 bg-gradient-to-r from-amber-500/20 to-transparent border-l-4 border-amber-500 px-3 py-1.5 rounded-r">
                    <span className="text-[15px]">📍</span>
                    <span className="text-[13px] font-bold text-amber-100">{location}</span>
                    <span className="text-[10px] font-mono text-amber-400/70">({visibleBoxes.length} 개)</span>
                  </div>
                  <div className="flex-1 border-t border-amber-500/20"></div>
                </div>

                {/* 월박스 카드들 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {visibleBoxes.map(wb => {
                    const externalOuts = connsFromDevice(wb.id);
                    const externalIns = connsToDevice(wb.id);
                    return (
                      <div
                        key={wb.id}
                        className="bg-gradient-to-br from-amber-500/5 to-transparent border border-amber-500/20 rounded-xl overflow-hidden hover:border-amber-500/40 transition"
                      >
                        {/* 월박스 헤더 */}
                        <div className="px-4 py-3 border-b border-amber-500/15 bg-gradient-to-r from-amber-500/10 to-transparent flex items-start gap-3">
                          <div className="w-1 h-10 rounded-full bg-gradient-to-b from-amber-300 to-amber-600 shrink-0 mt-0.5"
                               style={{ boxShadow: '0 0 8px rgba(251,191,36,0.5)' }}></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-[13px] font-bold text-white truncate">{wb.name}</div>
                              {wb.roomNumber && (
                                <span className="text-[9.5px] px-1.5 py-[1px] rounded font-mono font-bold bg-amber-500/25 text-amber-200 border border-amber-500/40">
                                  {wb.roomNumber}
                                </span>
                              )}
                            </div>
                            {wb.model && <div className="text-[10px] font-mono text-neutral-500 truncate">{wb.model}</div>}
                          </div>
                          <button
                            onClick={() => onEditDevice(wb)}
                            className="text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-amber-500 text-neutral-400 hover:text-white border border-white/10 transition shrink-0"
                          >편집</button>
                        </div>

                        {/* 벽판넬 미니 렌더 */}
                        <div className="p-3 space-y-2">
                          {/* IN 섹션 */}
                          {wb.inputs.length > 0 && (
                            <div>
                              <div className="text-[9.5px] uppercase tracking-[0.12em] text-sky-300 font-bold mb-1 flex items-center gap-2">
                                <span>⬇ 입력</span>
                                <span className="text-neutral-600 font-mono">({wb.inputs.length})</span>
                                <div className="flex-1 h-px bg-sky-500/15"></div>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {wb.inputs.map(p => {
                                  const meta = wb.inputsMeta?.[p];
                                  const layer = meta?.layerId ? layerById.get(meta.layerId) : undefined;
                                  const cn = meta?.connType;
                                  const conn = connections.find(c => c.to_device === wb.id && c.to_port === p);
                                  const sourceDev = conn ? devById.get(conn.from_device) : null;
                                  return (
                                    <div
                                      key={p}
                                      className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] border ${conn ? 'bg-sky-500/10 border-sky-500/30' : 'bg-white/5 border-white/10'}`}
                                      title={`${p}${meta?.label ? ' — ' + meta.label : ''}${conn && sourceDev ? `\n← ${sourceDev.name} · ${conn.from_port}` : ''}`}
                                    >
                                      <div
                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                        style={{
                                          background: layer?.color ?? '#3B82F6',
                                          boxShadow: `0 0 4px ${layer?.color ?? '#3B82F6'}80`,
                                        }}
                                      ></div>
                                      <span className="font-mono font-medium text-neutral-200">{p}</span>
                                      {cn && <span className="font-mono text-[8.5px] text-neutral-500">{cn}</span>}
                                      {meta?.label && <span className="text-neutral-500 text-[9.5px] truncate max-w-32">{meta.label}</span>}
                                      {conn && sourceDev && (
                                        <span className="text-sky-300 text-[9px] font-mono truncate max-w-28" title={`${sourceDev.name} · ${conn.from_port}`}>
                                          ← {sourceDev.name}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* OUT 섹션 */}
                          {wb.outputs.length > 0 && (
                            <div>
                              <div className="text-[9.5px] uppercase tracking-[0.12em] text-orange-300 font-bold mb-1 flex items-center gap-2">
                                <span>⬆ 출력</span>
                                <span className="text-neutral-600 font-mono">({wb.outputs.length})</span>
                                <div className="flex-1 h-px bg-orange-500/15"></div>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {wb.outputs.map(p => {
                                  const meta = wb.outputsMeta?.[p];
                                  const layer = meta?.layerId ? layerById.get(meta.layerId) : undefined;
                                  const cn = meta?.connType;
                                  const conn = connections.find(c => c.from_device === wb.id && c.from_port === p);
                                  const destDev = conn ? devById.get(conn.to_device) : null;
                                  return (
                                    <div
                                      key={p}
                                      className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] border ${conn ? 'bg-orange-500/10 border-orange-500/30' : 'bg-white/5 border-white/10'}`}
                                      title={`${p}${meta?.label ? ' — ' + meta.label : ''}${conn && destDev ? `\n→ ${destDev.name} · ${conn.to_port}` : ''}`}
                                    >
                                      <div
                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                        style={{
                                          background: layer?.color ?? '#F97316',
                                          boxShadow: `0 0 4px ${layer?.color ?? '#F97316'}80`,
                                        }}
                                      ></div>
                                      <span className="font-mono font-medium text-neutral-200">{p}</span>
                                      {cn && <span className="font-mono text-[8.5px] text-neutral-500">{cn}</span>}
                                      {meta?.label && <span className="text-neutral-500 text-[9.5px] truncate max-w-32">{meta.label}</span>}
                                      {conn && destDev && (
                                        <span className="text-orange-300 text-[9px] font-mono truncate max-w-28" title={`${destDev.name} · ${conn.to_port}`}>
                                          → {destDev.name}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 포트가 없을 때 */}
                          {wb.inputs.length === 0 && wb.outputs.length === 0 && (
                            <div className="text-[10px] text-neutral-600 text-center py-2 italic">
                              포트가 없음 — 장비 편집에서 포트 추가
                            </div>
                          )}
                        </div>

                        {/* 풋터 상태 */}
                        <div className="px-4 py-2 bg-black/30 border-t border-white/5 flex items-center justify-between text-[10px] font-mono">
                          <span className="text-sky-400/70">IN {externalIns.length}/{wb.inputs.length}</span>
                          <span className="text-neutral-600">
                            {externalIns.length + externalOuts.length > 0
                              ? `${externalIns.length + externalOuts.length}개 연결`
                              : '미연결'}
                          </span>
                          <span className="text-orange-400/70">OUT {externalOuts.length}/{wb.outputs.length}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
