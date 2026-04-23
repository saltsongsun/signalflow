'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, Trash2, X, Save, Upload, Wifi, WifiOff, ArrowUpToLine, ArrowDownToLine } from 'lucide-react';
import { supabase, type Device, type Connection } from '@/lib/supabase';
import { INITIAL_DEVICES, INITIAL_CONNECTIONS, TYPE_COLORS } from '@/lib/initialData';

const getEdgeType = (fromDevice: Device | undefined, toDevice: Device | undefined): 'video' | 'audio' | 'combined' => {
  if (!fromDevice || !toDevice) return 'video';
  if (fromDevice.type === toDevice.type) return fromDevice.type;
  if (fromDevice.type === 'combined' || toDevice.type === 'combined') return 'combined';
  return 'combined';
};

type TraceMode = 'both' | 'upstream' | 'downstream';

export default function SignalFlowMap() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [traceMode, setTraceMode] = useState<TraceMode>('both');
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<{ deviceId: string; port: string } | null>(null);
  const [draggingDevice, setDraggingDevice] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.75);
  const [isPanning, setIsPanning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeUsers, setActiveUsers] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragUpdateTimer = useRef<any>(null);

  // ----- 초기 로드 + 실시간 구독 -----
  useEffect(() => {
    loadData();

    const devicesChannel = (supabase as any)
      .channel('devices-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          setDevices(prev => [...prev.filter(d => d.id !== payload.new.id), payload.new]);
        } else if (payload.eventType === 'UPDATE') {
          setDevices(prev => prev.map(d => d.id === payload.new.id ? payload.new : d));
        } else if (payload.eventType === 'DELETE') {
          setDevices(prev => prev.filter(d => d.id !== payload.old.id));
        }
      })
      .subscribe();

    const connectionsChannel = (supabase as any)
      .channel('connections-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          setConnections(prev => [...prev.filter(c => c.id !== payload.new.id), payload.new]);
        } else if (payload.eventType === 'DELETE') {
          setConnections(prev => prev.filter(c => c.id !== payload.old.id));
        }
      })
      .subscribe((status: string) => setConnected(status === 'SUBSCRIBED'));

    const presenceChannel = (supabase as any).channel('presence-room');
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        setActiveUsers(Object.keys(state).length);
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ user_id: crypto.randomUUID(), online_at: new Date().toISOString() });
        }
      });

    return () => {
      devicesChannel.unsubscribe();
      connectionsChannel.unsubscribe();
      presenceChannel.unsubscribe();
    };
  }, []);

  const loadData = async () => {
    try {
      const { data: deviceData } = await supabase.from('devices').select('*');
      const { data: connData } = await supabase.from('connections').select('*');

      if (!deviceData || deviceData.length === 0) {
        await supabase.from('devices').insert(INITIAL_DEVICES);
        const { data: seeded } = await supabase.from('devices').select('*');
        setDevices(seeded || INITIAL_DEVICES);
        const connsWithId = INITIAL_CONNECTIONS.map(c => ({ ...c, id: crypto.randomUUID() }));
        await supabase.from('connections').insert(connsWithId);
        const { data: seededConns } = await supabase.from('connections').select('*');
        setConnections(seededConns || connsWithId);
      } else {
        setDevices(deviceData);
        setConnections(connData || []);
      }
    } catch (err) {
      console.error('Load failed:', err);
      setDevices(INITIAL_DEVICES);
      setConnections(INITIAL_CONNECTIONS.map(c => ({ ...c, id: crypto.randomUUID() })));
    } finally {
      setLoading(false);
    }
  };

  const getDeviceSize = (d: Device) => {
    const portCount = Math.max(d.inputs.length, d.outputs.length, 1);
    return { w: 180, h: 50 + portCount * 22 };
  };

  const getPortPosition = (device: Device, port: string, isOutput: boolean) => {
    const { w, h } = getDeviceSize(device);
    const ports = isOutput ? device.outputs : device.inputs;
    const idx = ports.indexOf(port);
    if (idx === -1) return { x: device.x + w / 2, y: device.y + h / 2 };
    return { x: isOutput ? device.x + w : device.x, y: device.y + 42 + idx * 22 + 8 };
  };

  // ===== 경로 추적: upstream + downstream =====
  const activePath = useMemo(() => {
    if (!selectedDevice) return {
      upstreamDevices: new Set<string>(),
      downstreamDevices: new Set<string>(),
      upstreamConns: new Set<string>(),
      downstreamConns: new Set<string>(),
    };

    const upDev = new Set<string>();
    const downDev = new Set<string>();
    const upConn = new Set<string>();
    const downConn = new Set<string>();

    // Upstream: 이 장비로 들어오는 경로 역추적
    if (traceMode !== 'downstream') {
      const traceUp = (deviceId: string) => {
        if (upDev.has(deviceId)) return;
        upDev.add(deviceId);
        connections.forEach((c) => {
          if (c.to_device === deviceId) {
            upConn.add(c.id);
            traceUp(c.from_device);
          }
        });
      };
      traceUp(selectedDevice);
    }

    // Downstream: 이 장비에서 나가는 경로 순추적
    if (traceMode !== 'upstream') {
      const traceDown = (deviceId: string) => {
        if (downDev.has(deviceId)) return;
        downDev.add(deviceId);
        connections.forEach((c) => {
          if (c.from_device === deviceId) {
            downConn.add(c.id);
            traceDown(c.to_device);
          }
        });
      };
      traceDown(selectedDevice);
    }

    return { upstreamDevices: upDev, downstreamDevices: downDev, upstreamConns: upConn, downstreamConns: downConn };
  }, [selectedDevice, traceMode, connections]);

  // ===== 장비 클릭 =====
  const handleDeviceClick = (device: Device) => {
    if (draggingDevice) return;
    // 입출력 모두 없으면 선택 불가
    if (device.inputs.length === 0 && device.outputs.length === 0) return;
    if (selectedDevice === device.id) {
      setSelectedDevice(null);
    } else {
      setSelectedDevice(device.id);
      // 자동 모드 결정: 입력만=upstream, 출력만=downstream, 둘 다=both
      if (device.inputs.length === 0) setTraceMode('downstream');
      else if (device.outputs.length === 0) setTraceMode('upstream');
      else setTraceMode('both');
    }
  };

  // ===== 포트 클릭 (연결) =====
  const handlePortClick = async (deviceId: string, port: string, isOutput: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutput) {
      setPendingConnection({ deviceId, port });
    } else if (pendingConnection) {
      const exists = connections.some(c => c.to_device === deviceId && c.to_port === port);
      if (!exists && pendingConnection.deviceId !== deviceId) {
        const newConn = {
          id: crypto.randomUUID(),
          from_device: pendingConnection.deviceId,
          from_port: pendingConnection.port,
          to_device: deviceId,
          to_port: port,
        };
        setConnections(prev => [...prev, newConn]);
        await supabase.from('connections').insert(newConn);
      }
      setPendingConnection(null);
    }
  };

  const deleteConnection = async (id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id));
    await supabase.from('connections').delete().eq('id', id);
  };

  const handleDeviceMouseDown = (device: Device, e: React.MouseEvent) => {
    const target = e.target as Element;
    if (target.closest('.port-dot') || target.closest('.device-action')) return;
    e.stopPropagation();
    const svgRect = svgRef.current!.getBoundingClientRect();
    const offsetX = (e.clientX - svgRect.left) / zoom - pan.x - device.x;
    const offsetY = (e.clientY - svgRect.top) / zoom - pan.y - device.y;
    setDraggingDevice({ id: device.id, offsetX, offsetY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingDevice) {
      const svgRect = svgRef.current!.getBoundingClientRect();
      const x = (e.clientX - svgRect.left) / zoom - pan.x - draggingDevice.offsetX;
      const y = (e.clientY - svgRect.top) / zoom - pan.y - draggingDevice.offsetY;
      setDevices(prev => prev.map(d => d.id === draggingDevice.id ? { ...d, x, y } : d));
      if (dragUpdateTimer.current) clearTimeout(dragUpdateTimer.current);
      dragUpdateTimer.current = setTimeout(() => {
        supabase.from('devices').update({ x, y }).eq('id', draggingDevice.id);
      }, 150);
    } else if (isPanning) {
      setPan({ x: pan.x + e.movementX / zoom, y: pan.y + e.movementY / zoom });
    }
  };

  const handleMouseUp = () => {
    if (draggingDevice) {
      const d = devices.find(x => x.id === draggingDevice.id);
      if (d) {
        if (dragUpdateTimer.current) clearTimeout(dragUpdateTimer.current);
        supabase.from('devices').update({ x: d.x, y: d.y }).eq('id', d.id);
      }
    }
    setDraggingDevice(null);
    setIsPanning(false);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const target = e.target as Element;
    if (target === svgRef.current || target.classList.contains('canvas-bg')) {
      if (e.button === 0 && !pendingConnection) setIsPanning(true);
      setSelectedDevice(null);
      setPendingConnection(null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(Math.max(0.2, Math.min(2.5, zoom * delta)));
  };

  const addDevice = async (newDevice: Omit<Device, 'id'>) => {
    const device = { ...newDevice, id: `dev_${Date.now()}`, x: 300, y: 300 };
    setDevices(prev => [...prev, device]);
    await supabase.from('devices').insert(device);
    setShowAddDevice(false);
  };

  const deleteDevice = async (id: string) => {
    setDevices(prev => prev.filter(d => d.id !== id));
    setConnections(prev => prev.filter(c => c.from_device !== id && c.to_device !== id));
    await supabase.from('connections').delete().or(`from_device.eq.${id},to_device.eq.${id}`);
    await supabase.from('devices').delete().eq('id', id);
    setEditingDevice(null);
  };

  const updateDevice = async (updated: Device) => {
    setDevices(prev => prev.map(d => d.id === updated.id ? updated : d));
    await supabase.from('devices').update(updated).eq('id', updated.id);
    setEditingDevice(null);
  };

  const saveConfig = () => {
    const data = JSON.stringify({ devices, connections }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'signal_flow_config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target!.result as string);
        if (data.devices && data.connections) {
          if (!confirm('현재 맵을 교체합니다. 모든 참여자에게 반영됩니다.')) return;
          await supabase.from('connections').delete().neq('id', '');
          await supabase.from('devices').delete().neq('id', '');
          await supabase.from('devices').insert(data.devices);
          await supabase.from('connections').insert(data.connections);
        }
      } catch (err) { alert('파일 오류'); }
    };
    reader.readAsText(file);
  };

  if (loading) {
    return (
      <div className="w-full h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-neutral-500 text-xs tracking-widest animate-pulse">LOADING SIGNAL MAP...</div>
      </div>
    );
  }

  const selectedDev = selectedDevice ? devices.find(d => d.id === selectedDevice) : null;

  return (
    <div className="w-full h-screen bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden font-mono">
      {/* 상단 바 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur z-10">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`}></div>
          <h1 className="text-sm tracking-widest uppercase text-neutral-300 font-semibold">Signal Flow Map</h1>
          <span className="text-xs text-neutral-500">UHD Broadcast</span>
          <div className="flex items-center gap-1 text-[10px] text-neutral-500 ml-2">
            {connected ? <Wifi size={11} className="text-emerald-400"/> : <WifiOff size={11} className="text-red-400"/>}
            <span>{activeUsers} online</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LegendDot color="#3B82F6" label="VIDEO" />
          <LegendDot color="#EF4444" label="AUDIO" />
          <LegendDot color="#A855F7" label="V+A" />
          <div className="w-px h-5 bg-neutral-700 mx-2"></div>
          <button onClick={() => setShowAddDevice(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-xs">
            <Plus size={13}/> 장비 추가
          </button>
          <button onClick={saveConfig} className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-xs" title="JSON 저장">
            <Save size={13}/>
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-xs cursor-pointer" title="JSON 불러오기">
            <Upload size={13}/>
            <input type="file" accept=".json" className="hidden" onChange={loadConfig}/>
          </label>
        </div>
      </div>

      {/* 경로 추적 모드 선택 (선택된 장비가 있을 때만) */}
      {selectedDev && selectedDev.inputs.length > 0 && selectedDev.outputs.length > 0 && (
        <div className="absolute top-16 left-5 z-20 flex items-center gap-1 bg-neutral-900/95 backdrop-blur border border-neutral-700 rounded p-1">
          <button onClick={() => setTraceMode('upstream')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] ${traceMode === 'upstream' ? 'bg-blue-600' : 'hover:bg-neutral-800'}`}>
            <ArrowUpToLine size={11}/> 상류
          </button>
          <button onClick={() => setTraceMode('both')}
            className={`px-2 py-1 rounded text-[10px] ${traceMode === 'both' ? 'bg-blue-600' : 'hover:bg-neutral-800'}`}>
            양방향
          </button>
          <button onClick={() => setTraceMode('downstream')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] ${traceMode === 'downstream' ? 'bg-blue-600' : 'hover:bg-neutral-800'}`}>
            <ArrowDownToLine size={11}/> 하류
          </button>
        </div>
      )}

      {/* 상태 바 */}
      <div className="absolute bottom-3 left-5 z-10 flex items-center gap-3 text-[10px] text-neutral-500">
        <span>{devices.length} devices</span>
        <span>·</span>
        <span>{connections.length} links</span>
        {selectedDev && (<><span>·</span><span className="text-emerald-400">TRACING: {selectedDev.name}</span></>)}
        {pendingConnection && (<><span>·</span><span className="text-amber-400">연결 대기... 입력 포트 클릭</span><button onClick={()=>setPendingConnection(null)} className="text-neutral-500 hover:text-white">취소</button></>)}
      </div>

      <div className="absolute bottom-3 right-5 z-10 text-[10px] text-neutral-500">
        {Math.round(zoom * 100)}%  ·  장비 클릭=경로추적  ·  드래그=이동  ·  휠=줌
      </div>

      <svg
        ref={svgRef}
        className="flex-1 cursor-grab active:cursor-grabbing"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ background: '#0a0a0a' }}
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a1a1a" strokeWidth="0.5"/>
          </pattern>
          <pattern id="grid-major" width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 200 0 L 0 0 0 200" fill="none" stroke="#262626" strokeWidth="0.8"/>
          </pattern>
          {Object.entries(TYPE_COLORS).map(([type, c]) => (
            <marker key={type} id={`arrow-${type}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={c.main}/>
            </marker>
          ))}
          {Object.entries(TYPE_COLORS).map(([type, c]) => (
            <marker key={`ac-${type}`} id={`arrow-active-${type}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={c.glow}/>
            </marker>
          ))}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <rect className="canvas-bg" width="100%" height="100%" fill="url(#grid)"/>
        <rect className="canvas-bg" width="100%" height="100%" fill="url(#grid-major)"/>

        <g transform={`translate(${pan.x * zoom}, ${pan.y * zoom}) scale(${zoom})`}>
          {connections.map((conn) => {
            const fromDev = devices.find(d => d.id === conn.from_device);
            const toDev = devices.find(d => d.id === conn.to_device);
            if (!fromDev || !toDev) return null;
            const from = getPortPosition(fromDev, conn.from_port, true);
            const to = getPortPosition(toDev, conn.to_port, false);
            const edgeType = getEdgeType(fromDev, toDev);
            const color = TYPE_COLORS[edgeType];

            const isUpstream = activePath.upstreamConns.has(conn.id);
            const isDownstream = activePath.downstreamConns.has(conn.id);
            const isActive = isUpstream || isDownstream;
            const dimmed = !!selectedDevice && !isActive;

            const dx = Math.abs(to.x - from.x);
            const cp = Math.min(dx * 0.5, 120);
            const pathD = `M ${from.x} ${from.y} C ${from.x + cp} ${from.y}, ${to.x - cp} ${to.y}, ${to.x} ${to.y}`;

            return (
              <g key={conn.id} style={{ opacity: dimmed ? 0.12 : 1, transition: 'opacity 0.3s' }}>
                <path d={pathD} fill="none" stroke={color.main} strokeWidth={isActive ? 2.5 : 1.2} opacity={isActive ? 1 : 0.6}
                  markerEnd={`url(#arrow-${isActive ? 'active-' : ''}${edgeType})`} filter={isActive ? 'url(#glow)' : undefined}/>
                {isActive && (
                  <path d={pathD} fill="none" stroke={color.glow} strokeWidth="3" strokeDasharray="6 14" strokeLinecap="round" opacity="0.9">
                    <animate attributeName="stroke-dashoffset"
                      from="0" to={isUpstream && !isDownstream ? "40" : "-40"}
                      dur="1s" repeatCount="indefinite"/>
                  </path>
                )}
                <path d={pathD} fill="none" stroke="transparent" strokeWidth="14" style={{ cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); if (confirm('연결 삭제?')) deleteConnection(conn.id); }}/>
              </g>
            );
          })}

          {pendingConnection && (() => {
            const d = devices.find(x => x.id === pendingConnection.deviceId);
            if (!d) return null;
            const p = getPortPosition(d, pendingConnection.port, true);
            return <circle cx={p.x} cy={p.y} r="7" fill="none" stroke="#FBBF24" strokeWidth="2" opacity="0.8">
              <animate attributeName="r" from="7" to="14" dur="1s" repeatCount="indefinite"/>
              <animate attributeName="opacity" from="0.8" to="0" dur="1s" repeatCount="indefinite"/>
            </circle>;
          })()}

          {devices.map(device => {
            const { w, h } = getDeviceSize(device);
            const color = TYPE_COLORS[device.type];
            const isUp = activePath.upstreamDevices.has(device.id);
            const isDown = activePath.downstreamDevices.has(device.id);
            const isActive = isUp || isDown;
            const isSelected = selectedDevice === device.id;
            const dimmed = !!selectedDevice && !isActive;

            return (
              <g key={device.id} transform={`translate(${device.x}, ${device.y})`}
                style={{ opacity: dimmed ? 0.2 : 1, transition: 'opacity 0.3s', cursor: 'pointer' }}
                onMouseDown={(e) => handleDeviceMouseDown(device, e)}
                onClick={() => handleDeviceClick(device)}>
                <rect width={w} height={h} rx="4" fill={color.bg}
                  stroke={isSelected ? '#FBBF24' : color.border}
                  strokeWidth={isSelected ? 2.5 : 1}
                  filter={isActive ? 'url(#glow)' : undefined}/>
                <rect width={w} height="28" rx="4" fill={color.main} opacity="0.9"/>
                <rect y="24" width={w} height="5" fill={color.main} opacity="0.9"/>
                <text x="10" y="19" fill="#fff" fontSize="11" fontWeight="600" letterSpacing="0.5">
                  {device.name.length > 22 ? device.name.slice(0, 22) + '…' : device.name}
                </text>
                <text x={w - 12} y="19" fill="#fff" fontSize="9" opacity="0.7" textAnchor="end" letterSpacing="1">
                  {device.type === 'video' ? 'V' : device.type === 'audio' ? 'A' : 'V+A'}
                </text>
                <g className="device-action" transform={`translate(${w - 22}, 34)`} style={{ cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); setEditingDevice(device); }}>
                  <circle r="8" fill="#000" opacity="0"/>
                  <text x="0" y="3" textAnchor="middle" fontSize="12" fill="#fff" opacity="0.5">⚙</text>
                </g>
                {device.inputs.map((port, i) => (
                  <g key={`in-${i}`} transform={`translate(0, ${42 + i * 22 + 8})`}>
                    <circle className="port-dot" cx="0" cy="0" r="5"
                      fill={pendingConnection ? '#FBBF24' : '#171717'} stroke={color.main} strokeWidth="1.5"
                      style={{ cursor: 'crosshair' }}
                      onClick={(e) => handlePortClick(device.id, port, false, e)}/>
                    <text x="10" y="3" fill="#a3a3a3" fontSize="9">{port}</text>
                  </g>
                ))}
                {device.outputs.map((port, i) => (
                  <g key={`out-${i}`} transform={`translate(${w}, ${42 + i * 22 + 8})`}>
                    <circle className="port-dot" cx="0" cy="0" r="5"
                      fill={pendingConnection?.deviceId === device.id && pendingConnection?.port === port ? '#FBBF24' : color.main}
                      stroke={color.glow} strokeWidth="1.5" style={{ cursor: 'crosshair' }}
                      onClick={(e) => handlePortClick(device.id, port, true, e)}/>
                    <text x="-10" y="3" fill="#a3a3a3" fontSize="9" textAnchor="end">{port}</text>
                  </g>
                ))}
                {isSelected && (
                  <rect x="-2" y="-2" width={w + 4} height={h + 4} rx="5" fill="none" stroke="#FBBF24" strokeWidth="1.5" opacity="0.6">
                    <animate attributeName="opacity" from="0.6" to="0.2" dur="1.5s" repeatCount="indefinite"/>
                  </rect>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {editingDevice && (
        <DeviceEditor device={editingDevice} onSave={updateDevice} onDelete={deleteDevice} onClose={() => setEditingDevice(null)}/>
      )}
      {showAddDevice && (
        <DeviceEditor device={{ id: '', name: '새 장비', type: 'video', x: 0, y: 0, inputs: ['IN'], outputs: ['OUT'], physPorts: {}, routing: {} }}
          onSave={addDevice as any} onClose={() => setShowAddDevice(false)} isNew/>
      )}
      {selectedDev && (
        <SignalPathPanel device={selectedDev} devices={devices} connections={connections}
          traceMode={traceMode} onClose={() => setSelectedDevice(null)}/>
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-neutral-800/60">
      <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }}></div>
      <span className="text-[10px] tracking-wider text-neutral-300">{label}</span>
    </div>
  );
}

function DeviceEditor({ device, onSave, onDelete, onClose, isNew }: {
  device: Device; onSave: (d: Device) => void; onDelete?: (id: string) => void; onClose: () => void; isNew?: boolean;
}) {
  const [d, setD] = useState<Device>({ ...device });
  const [inputsText, setInputsText] = useState(device.inputs.join(', '));
  const [outputsText, setOutputsText] = useState(device.outputs.join(', '));

  const save = () => {
    const inputs = inputsText.split(',').map(s => s.trim()).filter(Boolean);
    const outputs = outputsText.split(',').map(s => s.trim()).filter(Boolean);
    onSave({ ...d, inputs, outputs });
  };

  const allPorts = [...inputsText.split(',').map(s => s.trim()).filter(Boolean),
    ...outputsText.split(',').map(s => s.trim()).filter(Boolean)];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-[500px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800">
          <h2 className="text-sm tracking-widest uppercase font-semibold">{isNew ? '장비 추가' : '장비 편집'}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <Field label="장비 이름">
            <input value={d.name} onChange={e => setD({...d, name: e.target.value})}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 focus:border-blue-500 outline-none"/>
          </Field>
          <Field label="신호 타입">
            <div className="flex gap-2">
              {[['video','비디오','#3B82F6'],['audio','오디오','#EF4444'],['combined','V+A','#A855F7']].map(([v, l, c]) => (
                <button key={v} onClick={() => setD({...d, type: v as any})}
                  className="flex-1 px-3 py-2 rounded border transition-colors"
                  style={{ borderColor: d.type === v ? c : '#404040', background: d.type === v ? c + '22' : 'transparent', color: d.type === v ? c : '#a3a3a3' }}>
                  {l}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="입력 포트 (쉼표 구분)">
              <input value={inputsText} onChange={e => setInputsText(e.target.value)} placeholder="IN1, IN2"
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 focus:border-blue-500 outline-none text-xs"/>
            </Field>
            <Field label="출력 포트">
              <input value={outputsText} onChange={e => setOutputsText(e.target.value)} placeholder="OUT1, OUT2"
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 focus:border-blue-500 outline-none text-xs"/>
            </Field>
          </div>
          {allPorts.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-neutral-500 uppercase tracking-widest">포트별 설정</div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {allPorts.map(port => (
                  <div key={port} className="grid grid-cols-[80px_1fr_1fr] gap-2 items-center text-xs">
                    <span className="text-neutral-400">{port}</span>
                    <input placeholder="물리 포트" value={d.physPorts?.[port] || ''}
                      onChange={e => setD({...d, physPorts: {...d.physPorts, [port]: e.target.value}})}
                      className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 focus:border-blue-500 outline-none"/>
                    <input placeholder="라우팅 이름" value={d.routing?.[port] || ''}
                      onChange={e => setD({...d, routing: {...d.routing, [port]: e.target.value}})}
                      className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 focus:border-blue-500 outline-none"/>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-800 bg-neutral-950/50">
          {!isNew && onDelete ? (
            <button onClick={() => { if (confirm('삭제할까요?')) onDelete(d.id); }}
              className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1">
              <Trash2 size={13}/> 삭제
            </button>
          ) : <div/>}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-xs text-neutral-400 hover:text-white">취소</button>
            <button onClick={save} className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 rounded">저장</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function SignalPathPanel({ device, devices, connections, traceMode, onClose }: {
  device: Device; devices: Device[]; connections: Connection[]; traceMode: TraceMode; onClose: () => void;
}) {
  // Upstream paths
  const upstreamPaths = useMemo(() => {
    if (traceMode === 'downstream') return [];
    const result: any[] = [];
    const trace = (deviceId: string, path: any[]) => {
      const incoming = connections.filter(c => c.to_device === deviceId);
      if (incoming.length === 0) { result.push([...path].reverse()); return; }
      incoming.forEach(c => {
        const from = devices.find(d => d.id === c.from_device);
        if (!from) return;
        trace(c.from_device, [...path, { device: from, port: c.from_port, toPort: c.to_port, toDevice: devices.find(d => d.id === c.to_device) }]);
      });
    };
    trace(device.id, []);
    return result;
  }, [device, devices, connections, traceMode]);

  // Downstream paths
  const downstreamPaths = useMemo(() => {
    if (traceMode === 'upstream') return [];
    const result: any[] = [];
    const trace = (deviceId: string, path: any[]) => {
      const outgoing = connections.filter(c => c.from_device === deviceId);
      if (outgoing.length === 0) { result.push([...path]); return; }
      outgoing.forEach(c => {
        const to = devices.find(d => d.id === c.to_device);
        if (!to) return;
        trace(c.to_device, [...path, { device: to, fromPort: c.from_port, toPort: c.to_port, fromDevice: devices.find(d => d.id === c.from_device) }]);
      });
    };
    trace(device.id, []);
    return result;
  }, [device, devices, connections, traceMode]);

  return (
    <div className="absolute top-16 right-4 w-80 bg-neutral-900/95 backdrop-blur border border-neutral-700 rounded-lg shadow-2xl z-20 max-h-[80vh] overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-neutral-500">Signal Trace</div>
          <div className="text-sm font-semibold">{device.name}</div>
        </div>
        <button onClick={onClose} className="text-neutral-500 hover:text-white"><X size={16}/></button>
      </div>
      <div className="overflow-y-auto flex-1 p-3 space-y-3 text-xs">
        {upstreamPaths.length > 0 && (
          <div>
            <div className="text-[9px] uppercase tracking-widest text-emerald-400 mb-2 flex items-center gap-1">
              <ArrowUpToLine size={11}/> 상류 (입력 경로)
            </div>
            {upstreamPaths.map((path, i) => (
              <div key={i} className="border border-neutral-800 rounded p-2 bg-neutral-950/50 mb-2">
                <div className="text-[9px] text-neutral-500 mb-1.5">경로 {i+1}</div>
                {path.map((step: any, j: number) => (
                  <div key={j} className="flex items-center gap-2 py-1">
                    <div className="w-1 h-1 rounded-full" style={{ background: TYPE_COLORS[step.device.type as keyof typeof TYPE_COLORS].main }}></div>
                    <div className="flex-1">
                      <div className="text-neutral-200">{step.device.name}</div>
                      <div className="text-[10px] text-neutral-500">{step.port} → {step.toDevice?.name}:{step.toPort}</div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2 py-1 pt-1.5 border-t border-neutral-800 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#FBBF24' }}></div>
                  <div className="text-amber-400 font-semibold">{device.name} (선택됨)</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {downstreamPaths.length > 0 && (
          <div>
            <div className="text-[9px] uppercase tracking-widest text-sky-400 mb-2 flex items-center gap-1">
              <ArrowDownToLine size={11}/> 하류 (출력 경로)
            </div>
            {downstreamPaths.map((path, i) => (
              <div key={i} className="border border-neutral-800 rounded p-2 bg-neutral-950/50 mb-2">
                <div className="text-[9px] text-neutral-500 mb-1.5">경로 {i+1}</div>
                <div className="flex items-center gap-2 py-1">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#FBBF24' }}></div>
                  <div className="text-amber-400 font-semibold">{device.name} (선택됨)</div>
                </div>
                {path.map((step: any, j: number) => (
                  <div key={j} className="flex items-center gap-2 py-1">
                    <div className="w-1 h-1 rounded-full" style={{ background: TYPE_COLORS[step.device.type as keyof typeof TYPE_COLORS].main }}></div>
                    <div className="flex-1">
                      <div className="text-neutral-200">{step.device.name}</div>
                      <div className="text-[10px] text-neutral-500">{step.fromDevice?.name}:{step.fromPort} → {step.toPort}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {upstreamPaths.length === 0 && downstreamPaths.length === 0 && (
          <div className="text-neutral-500 text-center py-4">연결 없음</div>
        )}
      </div>
    </div>
  );
}
