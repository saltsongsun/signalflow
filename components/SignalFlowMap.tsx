'use client';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { supabase, Device, Connection, ConnectionType } from '../lib/supabase';
import { INITIAL_DEVICES, INITIAL_CONNECTIONS, TYPE_COLORS, CONN_TYPE_STYLES } from '../lib/initialData';
import DeviceEditor from './DeviceEditor';

type TraceMode = 'both' | 'upstream' | 'downstream';

const PORT_H = 22;
const PORT_R = 5;
const HEADER_H = 44;
const PADDING_Y = 14;

function deviceWidth(d: Device) { return d.width ?? 200; }
function deviceHeight(d: Device) {
  if (d.height) return d.height;
  const portCount = Math.max(d.inputs.length, d.outputs.length);
  return HEADER_H + PADDING_Y * 2 + portCount * PORT_H;
}

function inputY(d: Device, i: number)  { return d.y + HEADER_H + PADDING_Y + i * PORT_H + PORT_H/2; }
function outputY(d: Device, i: number) { return d.y + HEADER_H + PADDING_Y + i * PORT_H + PORT_H/2; }

export default function SignalFlowMap() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(1);

  const [editMode, setEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [traceMode, setTraceMode] = useState<TraceMode>('both');
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [pendingFrom, setPendingFrom] = useState<{ device: string; port: string; connType?: ConnectionType } | null>(null);

  const [scale, setScale] = useState(0.7);
  const [offset, setOffset] = useState({ x: 40, y: 40 });
  const [draggingCanvas, setDraggingCanvas] = useState(false);
  const [draggingDevice, setDraggingDevice] = useState<string | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Load
  useEffect(() => {
    (async () => {
      const { data: devs } = await supabase.from('devices').select('*');
      const { data: conns } = await supabase.from('connections').select('*');
      if (devs && devs.length > 0) {
        setDevices(devs as any);
        setConnections((conns ?? []) as any);
      } else {
        // seed
        await (supabase as any).from('devices').insert(INITIAL_DEVICES);
        const connsToSeed = INITIAL_CONNECTIONS.map(c => ({ ...c, id: crypto.randomUUID() }));
        await (supabase as any).from('connections').insert(connsToSeed);
        setDevices(INITIAL_DEVICES);
        setConnections(connsToSeed as any);
      }
      setLoading(false);
    })();

    const ch = (supabase as any).channel('sfm')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, (p: any) => {
        if (p.eventType === 'INSERT') setDevices(prev => [...prev.filter(d => d.id !== p.new.id), p.new]);
        else if (p.eventType === 'UPDATE') setDevices(prev => prev.map(d => d.id === p.new.id ? p.new : d));
        else if (p.eventType === 'DELETE') setDevices(prev => prev.filter(d => d.id !== p.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, (p: any) => {
        if (p.eventType === 'INSERT') setConnections(prev => [...prev.filter(c => c.id !== p.new.id), p.new]);
        else if (p.eventType === 'UPDATE') setConnections(prev => prev.map(c => c.id === p.new.id ? p.new : c));
        else if (p.eventType === 'DELETE') setConnections(prev => prev.filter(c => c.id !== p.old.id));
      });

    const presence = ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      const count = Object.keys(state).length;
      setOnline(count || 1);
    });

    presence.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ user_id: crypto.randomUUID() });
      }
    });

    return () => { (supabase as any).removeChannel(ch); };
  }, []);

  const devById = useMemo(() => new Map(devices.map(d => [d.id, d])), [devices]);

  // trace: upstream/downstream
  const traced = useMemo(() => {
    if (!selectedId) return { devices: new Set<string>(), connections: new Set<string>() };
    const dSet = new Set<string>([selectedId]);
    const cSet = new Set<string>();
    const visit = (id: string, dir: 'up' | 'down') => {
      connections.forEach(c => {
        if (dir === 'up' && c.to_device === id) {
          if (!cSet.has(c.id)) { cSet.add(c.id); if (!dSet.has(c.from_device)) { dSet.add(c.from_device); visit(c.from_device, 'up'); } }
        }
        if (dir === 'down' && c.from_device === id) {
          if (!cSet.has(c.id)) { cSet.add(c.id); if (!dSet.has(c.to_device)) { dSet.add(c.to_device); visit(c.to_device, 'down'); } }
        }
      });
    };
    if (traceMode === 'both' || traceMode === 'upstream')   visit(selectedId, 'up');
    if (traceMode === 'both' || traceMode === 'downstream') visit(selectedId, 'down');
    return { devices: dSet, connections: cSet };
  }, [selectedId, connections, traceMode]);

  // mouse
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-device-id], [data-port]')) return;
    setDraggingCanvas(true);
    dragStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    if (!editMode) setSelectedId(null);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (draggingCanvas) setOffset({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y });
    if (draggingDevice && editMode) {
      const d = devById.get(draggingDevice);
      if (d) {
        const nx = (e.clientX - offset.x) / scale - dragOffsetRef.current.x;
        const ny = (e.clientY - offset.y) / scale - dragOffsetRef.current.y;
        setDevices(prev => prev.map(x => x.id === draggingDevice ? { ...x, x: nx, y: ny } : x));
      }
    }
  };
  const onMouseUp = async () => {
    if (draggingDevice) {
      const d = devById.get(draggingDevice);
      if (d) await (supabase as any).from('devices').update({ x: d.x, y: d.y }).eq('id', d.id);
    }
    setDraggingCanvas(false);
    setDraggingDevice(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    setScale(s => Math.min(2, Math.max(0.2, s * delta)));
  };

  const onDeviceMouseDown = (e: React.MouseEvent, d: Device) => {
    e.stopPropagation();
    if (!editMode) return;
    setDraggingDevice(d.id);
    dragOffsetRef.current = {
      x: (e.clientX - offset.x) / scale - d.x,
      y: (e.clientY - offset.y) / scale - d.y,
    };
  };

  const onDeviceClick = (e: React.MouseEvent, d: Device) => {
    e.stopPropagation();
    if (editMode) {
      setEditingDevice(d);
    } else {
      setSelectedId(s => s === d.id ? null : d.id);
    }
  };

  const onPortClick = async (e: React.MouseEvent, deviceId: string, port: string, isOutput: boolean) => {
    e.stopPropagation();
    if (!editMode) return;
    const d = devById.get(deviceId);
    if (!d) return;

    if (isOutput) {
      const ct = d.outputsMeta?.[port]?.connType;
      setPendingFrom({ device: deviceId, port, connType: ct });
      return;
    }
    // clicking input -> if pending output, connect
    if (pendingFrom) {
      const newConn = {
        id: crypto.randomUUID(),
        from_device: pendingFrom.device,
        from_port: pendingFrom.port,
        to_device: deviceId,
        to_port: port,
        conn_type: pendingFrom.connType ?? d.inputsMeta?.[port]?.connType ?? null,
      };
      await (supabase as any).from('connections').delete()
        .eq('to_device', deviceId).eq('to_port', port);
      await (supabase as any).from('connections').insert(newConn);
      setPendingFrom(null);
    }
  };

  const handleAddDevice = async () => {
    const id = `dev_${Date.now().toString(36)}`;
    const d: Device = {
      id, name: '새 장비', type: 'video',
      x: (-offset.x + 300) / scale, y: (-offset.y + 200) / scale,
      width: 200,
      inputs: ['IN-1'], outputs: ['OUT-1'],
      inputsMeta: { 'IN-1': { name: 'IN-1' } },
      outputsMeta: { 'OUT-1': { name: 'OUT-1' } },
      physPorts: {}, routing: {},
    };
    await (supabase as any).from('devices').insert(d);
    setEditingDevice(d);
  };

  const handleSaveDevice = async (updates: Partial<Device>) => {
    if (!editingDevice) return;
    await (supabase as any).from('devices').update(updates).eq('id', editingDevice.id);
    setEditingDevice(null);
  };
  const handleDeleteDevice = async () => {
    if (!editingDevice) return;
    await (supabase as any).from('connections').delete()
      .or(`from_device.eq.${editingDevice.id},to_device.eq.${editingDevice.id}`);
    await (supabase as any).from('devices').delete().eq('id', editingDevice.id);
    setEditingDevice(null);
  };

  const handleResetAll = async () => {
    if (!confirm('모든 장비와 연결을 삭제하고 도면 초기 데이터로 재시드합니다.')) return;
    await (supabase as any).from('connections').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await (supabase as any).from('devices').delete().neq('id', '__nope__');
    await (supabase as any).from('devices').insert(INITIAL_DEVICES);
    const conns = INITIAL_CONNECTIONS.map(c => ({ ...c, id: crypto.randomUUID() }));
    await (supabase as any).from('connections').insert(conns);
    setDevices(INITIAL_DEVICES);
    setConnections(conns as any);
  };

  if (loading) {
    return <div className="h-screen bg-neutral-950 flex items-center justify-center text-neutral-400 text-sm">불러오는 중…</div>;
  }

  return (
    <div className="h-screen w-screen bg-neutral-950 text-white overflow-hidden relative select-none">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-30 bg-neutral-950/85 backdrop-blur-md border-b border-neutral-800 px-4 h-12 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
          <span className="text-sm font-medium">Signal Flow Map</span>
          <span className="text-xs text-neutral-500 ml-1">경남이스포츠 UHD</span>
        </div>

        <div className="w-px h-6 bg-neutral-800"></div>

        <div className="flex items-center gap-1 bg-neutral-900 rounded p-0.5">
          <button
            onClick={() => { setEditMode(false); setPendingFrom(null); }}
            className={`px-3 py-1 text-xs rounded transition-colors ${!editMode ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
          >보기</button>
          <button
            onClick={() => { setEditMode(true); setSelectedId(null); }}
            className={`px-3 py-1 text-xs rounded transition-colors ${editMode ? 'bg-amber-600 text-white' : 'text-neutral-400 hover:text-white'}`}
          >편집</button>
        </div>

        {!editMode && selectedId && (
          <div className="flex items-center gap-1 bg-neutral-900 rounded p-0.5">
            {(['both', 'upstream', 'downstream'] as TraceMode[]).map(m => (
              <button
                key={m}
                onClick={() => setTraceMode(m)}
                className={`px-2.5 py-1 text-[11px] rounded transition-colors ${traceMode === m ? 'bg-sky-600 text-white' : 'text-neutral-400 hover:text-white'}`}
              >{m === 'both' ? '양방향' : m === 'upstream' ? '상류' : '하류'}</button>
            ))}
          </div>
        )}

        {editMode && (
          <>
            <button
              onClick={handleAddDevice}
              className="px-3 py-1 text-xs bg-sky-600 hover:bg-sky-500 rounded text-white"
            >＋ 장비 추가</button>
            <button
              onClick={handleResetAll}
              className="px-3 py-1 text-xs bg-neutral-800 hover:bg-rose-600 rounded text-neutral-400 hover:text-white"
              title="도면 초기 데이터로 재시드"
            >⟲ 전체 초기화</button>
          </>
        )}

        <div className="ml-auto flex items-center gap-3 text-xs text-neutral-500">
          <span>{devices.length} devices · {connections.length} cables</span>
          <div className="w-px h-4 bg-neutral-800"></div>
          <span className="text-emerald-400">● {online} online</span>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute top-14 left-4 z-20 bg-neutral-900/85 backdrop-blur border border-neutral-800 rounded-lg px-3 py-2 text-[11px] space-y-1">
        <div className="text-neutral-500 uppercase text-[10px] tracking-wider mb-1">Type</div>
        <div className="flex items-center gap-2"><div className="w-3 h-2 rounded-sm bg-sky-500"></div> Video</div>
        <div className="flex items-center gap-2"><div className="w-3 h-2 rounded-sm bg-rose-500"></div> Audio</div>
        <div className="flex items-center gap-2"><div className="w-3 h-2 rounded-sm bg-purple-500"></div> V+A</div>
      </div>

      {/* Pending connection hint */}
      {pendingFrom && (
        <div className="absolute top-14 right-4 z-20 bg-amber-900/90 backdrop-blur border border-amber-700 rounded-lg px-4 py-2 text-xs">
          <div className="text-amber-200 font-medium mb-0.5">연결 대기 중</div>
          <div className="text-amber-100/80">{devById.get(pendingFrom.device)?.name} · {pendingFrom.port}</div>
          <div className="text-amber-200/60 mt-1">입력 포트를 클릭하세요. <button onClick={() => setPendingFrom(null)} className="underline ml-1">취소</button></div>
        </div>
      )}

      {/* Canvas */}
      <div
        className="absolute inset-0 pt-12 cursor-grab active:cursor-grabbing"
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: `${24 * scale}px ${24 * scale}px`,
          backgroundPosition: `${offset.x}px ${offset.y}px`,
        }}
      >
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            width: '4000px', height: '3000px',
            position: 'relative',
          }}
        >
          {/* Connections */}
          <svg width="4000" height="3000" className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible' }}>
            <defs>
              <filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>
            {connections.map(c => {
              const from = devById.get(c.from_device);
              const to = devById.get(c.to_device);
              if (!from || !to) return null;
              const fi = from.outputs.indexOf(c.from_port);
              const ti = to.inputs.indexOf(c.to_port);
              if (fi < 0 || ti < 0) return null;
              const x1 = from.x + deviceWidth(from);
              const y1 = outputY(from, fi);
              const x2 = to.x;
              const y2 = inputY(to, ti);
              const dx = Math.max(60, (x2 - x1) / 2);
              const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
              const isTraced = traced.connections.has(c.id);
              const isDim = selectedId && !isTraced;
              const ct = c.conn_type ?? from.outputsMeta?.[c.from_port]?.connType;
              const style = ct ? CONN_TYPE_STYLES[ct] : undefined;
              const color = from.type === 'audio' ? TYPE_COLORS.audio.main
                         : from.type === 'combined' ? TYPE_COLORS.combined.main
                         : TYPE_COLORS.video.main;

              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;

              return (
                <g key={c.id} opacity={isDim ? 0.12 : 1}>
                  <path d={path} stroke={color} strokeWidth={isTraced ? 2.5 : 1.5}
                        strokeDasharray={style?.dash ?? undefined}
                        fill="none" filter={isTraced ? 'url(#glow)' : undefined} />
                  {ct && (scale > 0.5 || isTraced) && (
                    <g>
                      <rect x={mx - 22} y={my - 8} width="44" height="14" rx="3"
                            fill="rgba(10,10,10,0.85)" stroke={color} strokeWidth="0.5" />
                      <text x={mx} y={my + 2.5} textAnchor="middle" fontSize="9"
                            fill={color} fontFamily="monospace" fontWeight="600">
                        {style?.label ?? ct}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Devices */}
          {devices.map(d => {
            const color = TYPE_COLORS[d.type];
            const isSelected = selectedId === d.id;
            const isTraced = traced.devices.has(d.id);
            const isDim = selectedId && !isTraced;
            const w = deviceWidth(d);
            const h = deviceHeight(d);

            return (
              <div
                key={d.id}
                data-device-id={d.id}
                onMouseDown={e => onDeviceMouseDown(e, d)}
                onClick={e => onDeviceClick(e, d)}
                className="absolute rounded-lg transition-opacity"
                style={{
                  left: d.x, top: d.y, width: w, minHeight: h,
                  background: `linear-gradient(180deg, ${color.bg} 0%, rgba(10,10,10,0.9) 100%)`,
                  border: `1.5px solid ${isSelected ? color.glow : editMode ? 'rgba(245,158,11,0.45)' : color.border}`,
                  boxShadow: isSelected ? `0 0 24px ${color.glow}66, inset 0 0 0 1px ${color.glow}55` : '0 2px 8px rgba(0,0,0,0.4)',
                  opacity: isDim ? 0.3 : 1,
                  cursor: editMode ? 'move' : 'pointer',
                  backdropFilter: 'blur(6px)',
                }}
              >
                {/* Header */}
                <div className="px-3 h-[44px] flex items-center gap-2 border-b"
                     style={{ borderColor: color.border }}>
                  <div className="w-1.5 h-4 rounded-full" style={{ background: color.main }}></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate text-white">{d.name}</div>
                    <div className="text-[9px] text-neutral-500 uppercase tracking-wider">{d.type}</div>
                  </div>
                </div>

                {/* Ports */}
                <div className="py-3.5 relative">
                  {/* inputs */}
                  <div className="space-y-0 pr-3">
                    {d.inputs.map((p, i) => {
                      const meta = d.inputsMeta?.[p];
                      const ct = meta?.connType;
                      const ctStyle = ct ? CONN_TYPE_STYLES[ct] : undefined;
                      return (
                        <div key={p} className="flex items-center" style={{ height: PORT_H }}>
                          <button
                            data-port
                            onClick={e => onPortClick(e, d.id, p, false)}
                            className="w-2.5 h-2.5 rounded-full -ml-[5px] hover:scale-150 transition-transform"
                            style={{ background: color.main, boxShadow: `0 0 6px ${color.glow}` }}
                            title={meta?.label ?? p}
                          ></button>
                          <div className="ml-2 flex-1 flex items-center gap-1.5 min-w-0">
                            <span className="text-[10.5px] text-neutral-300 font-mono truncate">{p}</span>
                            {ct && (
                              <span
                                className="text-[8.5px] px-1 rounded font-mono"
                                style={{ background: `${color.bg}`, color: color.glow, border: `0.5px solid ${color.border}` }}
                              >{ctStyle?.label ?? ct}</span>
                            )}
                            {meta?.label && (
                              <span className="text-[9px] text-neutral-500 truncate">{meta.label}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* outputs (right-aligned) */}
                  <div className="absolute top-3.5 right-0 space-y-0 pl-3 w-full pointer-events-none">
                    {d.outputs.map((p, i) => {
                      const meta = d.outputsMeta?.[p];
                      const ct = meta?.connType;
                      const ctStyle = ct ? CONN_TYPE_STYLES[ct] : undefined;
                      return (
                        <div key={p} className="flex items-center justify-end pointer-events-auto" style={{ height: PORT_H }}>
                          <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0 mr-2">
                            {meta?.label && (
                              <span className="text-[9px] text-neutral-500 truncate text-right">{meta.label}</span>
                            )}
                            {ct && (
                              <span
                                className="text-[8.5px] px-1 rounded font-mono"
                                style={{ background: `${color.bg}`, color: color.glow, border: `0.5px solid ${color.border}` }}
                              >{ctStyle?.label ?? ct}</span>
                            )}
                            <span className="text-[10.5px] text-neutral-300 font-mono truncate">{p}</span>
                          </div>
                          <button
                            data-port
                            onClick={e => onPortClick(e, d.id, p, true)}
                            className="w-2.5 h-2.5 rounded-full -mr-[5px] hover:scale-150 transition-transform"
                            style={{
                              background: pendingFrom?.device === d.id && pendingFrom?.port === p ? '#fbbf24' : color.main,
                              boxShadow: `0 0 6px ${color.glow}`,
                            }}
                            title={meta?.label ?? p}
                          ></button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Zoom */}
        <div className="absolute bottom-4 right-4 z-20 bg-neutral-900/85 backdrop-blur border border-neutral-800 rounded-lg p-1 flex flex-col gap-0.5">
          <button onClick={() => setScale(s => Math.min(2, s * 1.2))} className="w-8 h-8 hover:bg-neutral-800 rounded text-sm">＋</button>
          <div className="text-[10px] text-center text-neutral-500 py-1">{Math.round(scale * 100)}%</div>
          <button onClick={() => setScale(s => Math.max(0.2, s / 1.2))} className="w-8 h-8 hover:bg-neutral-800 rounded text-sm">−</button>
          <button onClick={() => { setScale(0.7); setOffset({ x: 40, y: 40 }); }} className="w-8 h-8 hover:bg-neutral-800 rounded text-[10px]">⊡</button>
        </div>
      </div>

      {editingDevice && (
        <DeviceEditor
          device={editingDevice}
          onSave={handleSaveDevice}
          onDelete={handleDeleteDevice}
          onClose={() => setEditingDevice(null)}
        />
      )}
    </div>
  );
}
