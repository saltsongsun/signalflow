'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, Device, Connection, ConnectionType, Layer, DEFAULT_LAYERS } from '../lib/supabase';
import { INITIAL_DEVICES, INITIAL_CONNECTIONS, TYPE_COLORS, CONN_TYPE_STYLES } from '../lib/initialData';
import DeviceEditor from './DeviceEditor';
import LayerPanel from './LayerPanel';

type TraceMode = 'both' | 'upstream' | 'downstream';

const PORT_H = 22;
const HEADER_H = 44;
const PADDING_Y = 14;
const DRAG_THRESHOLD = 4; // px — 이 이상 움직이면 드래그로 판정, 아니면 클릭

function deviceWidth(d: Device) { return d.width ?? 200; }

// 레이어 가시성 고려한 포트 필터
function visiblePorts(d: Device, dir: 'in' | 'out', visibleLayerIds: Set<string>): { name: string; index: number }[] {
  const arr = dir === 'in' ? d.inputs : d.outputs;
  const meta = dir === 'in' ? d.inputsMeta : d.outputsMeta;
  return arr
    .map((name, index) => ({ name, index }))
    .filter(p => {
      const lid = meta?.[p.name]?.layerId;
      if (!lid) return true; // 레이어 미지정은 항상 표시
      return visibleLayerIds.has(lid);
    });
}

function deviceHeight(d: Device, visibleLayerIds: Set<string>) {
  if (d.height) return d.height;
  const vi = visiblePorts(d, 'in', visibleLayerIds).length;
  const vo = visiblePorts(d, 'out', visibleLayerIds).length;
  const portCount = Math.max(vi, vo, 1);
  return HEADER_H + PADDING_Y * 2 + portCount * PORT_H;
}

// 특정 포트의 y좌표 (가시 포트 기준 renderIndex 사용)
function portYFromRenderIdx(d: Device, renderIdx: number) {
  return d.y + HEADER_H + PADDING_Y + renderIdx * PORT_H + PORT_H / 2;
}

export default function SignalFlowMap() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(1);

  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [traceId, setTraceId] = useState<string | null>(null);
  const [traceMode, setTraceMode] = useState<TraceMode>('both');
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [pendingFrom, setPendingFrom] = useState<{ device: string; port: string; connType?: ConnectionType } | null>(null);

  // 뷰포트
  const [scale, setScale] = useState(0.7);
  const [offset, setOffset] = useState({ x: 40, y: 60 });

  // 드래그 상태
  type DragState =
    | { kind: 'none' }
    | { kind: 'canvas'; startX: number; startY: number; origOffset: { x: number; y: number } }
    | { kind: 'device'; ids: string[]; startX: number; startY: number; origPositions: Record<string, { x: number; y: number }>; moved: boolean; clickedId: string; shiftKey: boolean }
    | { kind: 'marquee'; startX: number; startY: number; curX: number; curY: number };
  const [drag, setDrag] = useState<DragState>({ kind: 'none' });

  // Load
  useEffect(() => {
    (async () => {
      const [devRes, connRes, layerRes] = await Promise.all([
        supabase.from('devices').select('*'),
        supabase.from('connections').select('*'),
        supabase.from('layers').select('*'),
      ]);

      // 레이어 없으면 기본 시드
      let loadedLayers = (layerRes.data ?? []) as Layer[];
      if (loadedLayers.length === 0) {
        await (supabase as any).from('layers').insert(DEFAULT_LAYERS);
        loadedLayers = DEFAULT_LAYERS;
      }
      setLayers(loadedLayers);

      if (devRes.data && devRes.data.length > 0) {
        setDevices(devRes.data as any);
        setConnections((connRes.data ?? []) as any);
      } else {
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
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'layers' }, (p: any) => {
        if (p.eventType === 'INSERT') setLayers(prev => [...prev.filter(l => l.id !== p.new.id), p.new]);
        else if (p.eventType === 'UPDATE') setLayers(prev => prev.map(l => l.id === p.new.id ? p.new : l));
        else if (p.eventType === 'DELETE') setLayers(prev => prev.filter(l => l.id !== p.old.id));
      });

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      setOnline(Object.keys(state).length || 1);
    });

    ch.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') await ch.track({ user_id: crypto.randomUUID() });
    });

    return () => { (supabase as any).removeChannel(ch); };
  }, []);

  const devById = useMemo(() => new Map(devices.map(d => [d.id, d])), [devices]);
  const visibleLayerIds = useMemo(() => new Set(layers.filter(l => l.visible).map(l => l.id)), [layers]);
  const layerById = useMemo(() => new Map(layers.map(l => [l.id, l])), [layers]);

  // 가시 장비: 적어도 하나의 가시 포트가 있거나 포트가 전혀 없는 장비
  const isDeviceVisible = (d: Device): boolean => {
    const hasAny = d.inputs.length + d.outputs.length > 0;
    if (!hasAny) return true;
    const vi = visiblePorts(d, 'in', visibleLayerIds).length;
    const vo = visiblePorts(d, 'out', visibleLayerIds).length;
    return vi + vo > 0;
  };

  // 케이블 가시성: from_port와 to_port 모두 가시 레이어
  const isConnVisible = (c: Connection): boolean => {
    const from = devById.get(c.from_device);
    const to = devById.get(c.to_device);
    if (!from || !to) return false;
    const fromLayer = from.outputsMeta?.[c.from_port]?.layerId;
    const toLayer = to.inputsMeta?.[c.to_port]?.layerId;
    if (fromLayer && !visibleLayerIds.has(fromLayer)) return false;
    if (toLayer && !visibleLayerIds.has(toLayer)) return false;
    return isDeviceVisible(from) && isDeviceVisible(to);
  };

  // trace
  const traced = useMemo(() => {
    if (!traceId) return { devices: new Set<string>(), connections: new Set<string>() };
    const dSet = new Set<string>([traceId]);
    const cSet = new Set<string>();
    const visit = (id: string, dir: 'up' | 'down') => {
      connections.forEach(c => {
        if (!isConnVisible(c)) return;
        if (dir === 'up' && c.to_device === id && !cSet.has(c.id)) {
          cSet.add(c.id);
          if (!dSet.has(c.from_device)) { dSet.add(c.from_device); visit(c.from_device, 'up'); }
        }
        if (dir === 'down' && c.from_device === id && !cSet.has(c.id)) {
          cSet.add(c.id);
          if (!dSet.has(c.to_device)) { dSet.add(c.to_device); visit(c.to_device, 'down'); }
        }
      });
    };
    if (traceMode === 'both' || traceMode === 'upstream') visit(traceId, 'up');
    if (traceMode === 'both' || traceMode === 'downstream') visit(traceId, 'down');
    return { devices: dSet, connections: cSet };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceId, connections, traceMode, visibleLayerIds, devices]);

  // ========== 마우스 이벤트 ==========
  const worldFromClient = (cx: number, cy: number) => ({
    x: (cx - offset.x) / scale,
    y: (cy - offset.y) / scale,
  });

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // 장비/포트 위에서 시작한 드래그는 여기서 처리 안함
    if (target.closest('[data-device-id], [data-port], [data-ui]')) return;

    if (editMode && e.shiftKey) {
      // Shift+드래그 = 마키 선택
      const w = worldFromClient(e.clientX, e.clientY);
      setDrag({ kind: 'marquee', startX: w.x, startY: w.y, curX: w.x, curY: w.y });
    } else {
      // 캔버스 팬
      setDrag({ kind: 'canvas', startX: e.clientX, startY: e.clientY, origOffset: offset });
      if (!editMode) setTraceId(null);
      if (editMode && !e.shiftKey) setSelectedIds(new Set());
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (drag.kind === 'canvas') {
      setOffset({
        x: drag.origOffset.x + (e.clientX - drag.startX),
        y: drag.origOffset.y + (e.clientY - drag.startY),
      });
    } else if (drag.kind === 'device' && editMode) {
      const dx = (e.clientX - drag.startX) / scale;
      const dy = (e.clientY - drag.startY) / scale;
      const movedEnough = Math.abs(e.clientX - drag.startX) > DRAG_THRESHOLD || Math.abs(e.clientY - drag.startY) > DRAG_THRESHOLD;
      if (movedEnough) {
        setDevices(prev => prev.map(d => {
          const orig = drag.origPositions[d.id];
          if (orig) return { ...d, x: orig.x + dx, y: orig.y + dy };
          return d;
        }));
        if (!drag.moved) setDrag({ ...drag, moved: true });
      }
    } else if (drag.kind === 'marquee') {
      const w = worldFromClient(e.clientX, e.clientY);
      setDrag({ ...drag, curX: w.x, curY: w.y });
    }
  };

  const onMouseUp = async (e: React.MouseEvent) => {
    if (drag.kind === 'device') {
      if (drag.moved) {
        // 저장 — 이동된 장비 모두
        const updates = drag.ids.map(id => {
          const d = devById.get(id);
          if (!d) return null;
          const latest = devices.find(x => x.id === id);
          return latest ? (supabase as any).from('devices').update({ x: latest.x, y: latest.y }).eq('id', id) : null;
        }).filter(Boolean);
        await Promise.all(updates);
      } else {
        // 이동 안했으면 클릭으로 처리
        const clicked = devById.get(drag.clickedId);
        if (clicked) {
          if (editMode) {
            if (drag.shiftKey) {
              setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(drag.clickedId)) next.delete(drag.clickedId);
                else next.add(drag.clickedId);
                return next;
              });
            } else {
              // 편집 패널 열기
              setEditingDevice(clicked);
              setSelectedIds(new Set([drag.clickedId]));
            }
          } else {
            setTraceId(t => t === drag.clickedId ? null : drag.clickedId);
          }
        }
      }
    } else if (drag.kind === 'marquee') {
      // 마키 영역 내 장비 모두 선택
      const minX = Math.min(drag.startX, drag.curX);
      const maxX = Math.max(drag.startX, drag.curX);
      const minY = Math.min(drag.startY, drag.curY);
      const maxY = Math.max(drag.startY, drag.curY);
      const inside = devices.filter(d => {
        if (!isDeviceVisible(d)) return false;
        const w = deviceWidth(d);
        const h = deviceHeight(d, visibleLayerIds);
        return d.x < maxX && d.x + w > minX && d.y < maxY && d.y + h > minY;
      }).map(d => d.id);
      setSelectedIds(new Set(inside));
    }
    setDrag({ kind: 'none' });
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(2, Math.max(0.15, scale * delta));
    // 마우스 포인터 기준 줌
    const wx = (mx - offset.x) / scale;
    const wy = (my - offset.y) / scale;
    setScale(newScale);
    setOffset({ x: mx - wx * newScale, y: my - wy * newScale });
  };

  const onDeviceMouseDown = (e: React.MouseEvent, d: Device) => {
    e.stopPropagation();
    if (!editMode) {
      // 보기 모드는 클릭에서 처리
      return;
    }
    // 편집모드: 드래그 시작. 선택되어 있으면 그 그룹 전체, 아니면 이 장비만.
    const isInSelection = selectedIds.has(d.id);
    const idsToMove = isInSelection && selectedIds.size > 0 ? Array.from(selectedIds) : [d.id];
    const origPositions: Record<string, { x: number; y: number }> = {};
    idsToMove.forEach(id => {
      const dev = devById.get(id);
      if (dev) origPositions[id] = { x: dev.x, y: dev.y };
    });
    setDrag({
      kind: 'device',
      ids: idsToMove,
      startX: e.clientX, startY: e.clientY,
      origPositions, moved: false,
      clickedId: d.id,
      shiftKey: e.shiftKey,
    });
  };

  const onDeviceClickView = (e: React.MouseEvent, d: Device) => {
    if (editMode) return; // 편집모드는 mouseup에서 처리
    e.stopPropagation();
    setTraceId(t => t === d.id ? null : d.id);
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
    if (pendingFrom) {
      const newConn = {
        id: crypto.randomUUID(),
        from_device: pendingFrom.device,
        from_port: pendingFrom.port,
        to_device: deviceId,
        to_port: port,
        conn_type: pendingFrom.connType ?? d.inputsMeta?.[port]?.connType ?? null,
      };
      await (supabase as any).from('connections').delete().eq('to_device', deviceId).eq('to_port', port);
      await (supabase as any).from('connections').insert(newConn);
      setPendingFrom(null);
    }
  };

  const handleAddDevice = async () => {
    const id = `dev_${Date.now().toString(36)}`;
    const defaultLayer = layers[0]?.id ?? 'layer_video';
    const d: Device = {
      id, name: '새 장비', type: 'video',
      x: (-offset.x + 300) / scale, y: (-offset.y + 200) / scale,
      width: 200,
      inputs: ['IN-1'], outputs: ['OUT-1'],
      inputsMeta: { 'IN-1': { name: 'IN-1', layerId: defaultLayer } },
      outputsMeta: { 'OUT-1': { name: 'OUT-1', layerId: defaultLayer } },
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

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택된 ${selectedIds.size}개 장비를 삭제합니다.`)) return;
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await (supabase as any).from('connections').delete().or(`from_device.eq.${id},to_device.eq.${id}`);
      await (supabase as any).from('devices').delete().eq('id', id);
    }
    setSelectedIds(new Set());
  };

  const handleResetAll = async () => {
    if (!confirm('모든 장비/연결/레이어를 삭제하고 초기 데이터로 재시드합니다.')) return;
    await (supabase as any).from('connections').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await (supabase as any).from('devices').delete().neq('id', '__nope__');
    await (supabase as any).from('layers').delete().neq('id', '__nope__');
    await (supabase as any).from('layers').insert(DEFAULT_LAYERS);
    await (supabase as any).from('devices').insert(INITIAL_DEVICES);
    const conns = INITIAL_CONNECTIONS.map(c => ({ ...c, id: crypto.randomUUID() }));
    await (supabase as any).from('connections').insert(conns);
    setLayers(DEFAULT_LAYERS);
    setDevices(INITIAL_DEVICES);
    setConnections(conns as any);
  };

  if (loading) {
    return <div className="h-screen bg-neutral-950 flex items-center justify-center text-neutral-400 text-sm">불러오는 중…</div>;
  }

  return (
    <div className="h-screen w-screen bg-neutral-950 text-white overflow-hidden relative select-none">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-30 bg-neutral-950/85 backdrop-blur-md border-b border-neutral-800 px-4 h-12 flex items-center gap-3" data-ui>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
          <span className="text-sm font-medium">Signal Flow Map</span>
          <span className="text-xs text-neutral-500 ml-1">경남이스포츠 UHD</span>
        </div>

        <div className="w-px h-6 bg-neutral-800"></div>

        <div className="flex items-center gap-1 bg-neutral-900 rounded p-0.5">
          <button
            onClick={() => { setEditMode(false); setPendingFrom(null); setSelectedIds(new Set()); }}
            className={`px-3 py-1 text-xs rounded ${!editMode ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
          >보기</button>
          <button
            onClick={() => { setEditMode(true); setTraceId(null); }}
            className={`px-3 py-1 text-xs rounded ${editMode ? 'bg-amber-600 text-white' : 'text-neutral-400 hover:text-white'}`}
          >편집</button>
        </div>

        {!editMode && traceId && (
          <div className="flex items-center gap-1 bg-neutral-900 rounded p-0.5">
            {(['both', 'upstream', 'downstream'] as TraceMode[]).map(m => (
              <button
                key={m}
                onClick={() => setTraceMode(m)}
                className={`px-2.5 py-1 text-[11px] rounded ${traceMode === m ? 'bg-sky-600 text-white' : 'text-neutral-400 hover:text-white'}`}
              >{m === 'both' ? '양방향' : m === 'upstream' ? '상류' : '하류'}</button>
            ))}
          </div>
        )}

        {editMode && (
          <>
            <button onClick={handleAddDevice} className="px-3 py-1 text-xs bg-sky-600 hover:bg-sky-500 rounded text-white">＋ 장비</button>
            {selectedIds.size > 0 && (
              <>
                <span className="text-xs text-amber-400">{selectedIds.size}개 선택됨</span>
                <button onClick={handleDeleteSelected} className="px-2 py-1 text-xs bg-rose-900/60 hover:bg-rose-600 rounded text-rose-200 hover:text-white">삭제</button>
              </>
            )}
            <button onClick={handleResetAll} className="px-3 py-1 text-xs bg-neutral-800 hover:bg-rose-600 rounded text-neutral-400 hover:text-white">⟲ 초기화</button>
          </>
        )}

        <button
          onClick={() => setShowLayerPanel(s => !s)}
          className={`px-3 py-1 text-xs rounded ${showLayerPanel ? 'bg-purple-600 text-white' : 'bg-neutral-900 text-neutral-400 hover:text-white'}`}
          data-ui
        >⧉ 레이어 ({layers.filter(l => l.visible).length}/{layers.length})</button>

        <div className="ml-auto flex items-center gap-3 text-xs text-neutral-500">
          <span>{devices.length} · {connections.length} cables</span>
          <div className="w-px h-4 bg-neutral-800"></div>
          <span className="text-emerald-400">● {online}</span>
        </div>
      </div>

      {/* Layer panel */}
      {showLayerPanel && <LayerPanel layers={layers} onClose={() => setShowLayerPanel(false)} />}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-20 bg-neutral-900/85 backdrop-blur border border-neutral-800 rounded-lg px-3 py-2 text-[11px] space-y-1" data-ui>
        <div className="text-neutral-500 uppercase text-[10px] tracking-wider mb-1">Type</div>
        <div className="flex items-center gap-2"><div className="w-3 h-2 rounded-sm bg-sky-500"></div> Video</div>
        <div className="flex items-center gap-2"><div className="w-3 h-2 rounded-sm bg-rose-500"></div> Audio</div>
        <div className="flex items-center gap-2"><div className="w-3 h-2 rounded-sm bg-purple-500"></div> V+A</div>
        {editMode && (
          <div className="mt-2 pt-2 border-t border-neutral-800 text-[10px] text-neutral-500">
            Shift+클릭: 다중선택<br/>
            Shift+드래그: 박스선택
          </div>
        )}
      </div>

      {/* Pending */}
      {pendingFrom && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-amber-900/90 backdrop-blur border border-amber-700 rounded-lg px-4 py-2 text-xs" data-ui>
          <div className="text-amber-200 font-medium mb-0.5">연결 대기</div>
          <div className="text-amber-100/80">{devById.get(pendingFrom.device)?.name} · {pendingFrom.port}</div>
          <div className="text-amber-200/60 mt-1">입력 포트 클릭 · <button onClick={() => setPendingFrom(null)} className="underline">취소</button></div>
        </div>
      )}

      {/* Canvas */}
      <div
        className={`absolute inset-0 pt-12 ${drag.kind === 'canvas' ? 'cursor-grabbing' : 'cursor-grab'}`}
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
        <div style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: '0 0', width: '4000px', height: '3000px', position: 'relative' }}>
          {/* Connections */}
          <svg width="4000" height="3000" className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible' }}>
            <defs>
              <filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>
            {connections.map(c => {
              if (!isConnVisible(c)) return null;
              const from = devById.get(c.from_device)!;
              const to = devById.get(c.to_device)!;

              // 가시 포트 인덱스
              const outVis = visiblePorts(from, 'out', visibleLayerIds);
              const inVis = visiblePorts(to, 'in', visibleLayerIds);
              const fi = outVis.findIndex(p => p.name === c.from_port);
              const ti = inVis.findIndex(p => p.name === c.to_port);
              if (fi < 0 || ti < 0) return null;

              const x1 = from.x + deviceWidth(from);
              const y1 = portYFromRenderIdx(from, fi);
              const x2 = to.x;
              const y2 = portYFromRenderIdx(to, ti);
              const dx = Math.max(60, Math.abs(x2 - x1) / 2);
              const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
              const isTraced = traced.connections.has(c.id);
              const isDim = traceId && !isTraced;
              const ct = c.conn_type ?? from.outputsMeta?.[c.from_port]?.connType;
              const style = ct ? CONN_TYPE_STYLES[ct] : undefined;

              // 케이블 색: from 포트의 레이어 색 우선, 없으면 장비 타입 색
              const fromLayerId = from.outputsMeta?.[c.from_port]?.layerId;
              const layerColor = fromLayerId ? layerById.get(fromLayerId)?.color : undefined;
              const color = layerColor ?? (from.type === 'audio' ? TYPE_COLORS.audio.main
                         : from.type === 'combined' ? TYPE_COLORS.combined.main
                         : TYPE_COLORS.video.main);

              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;

              return (
                <g key={c.id} opacity={isDim ? 0.12 : 1}>
                  <path d={path} stroke={color} strokeWidth={isTraced ? 2.8 : 1.5}
                        strokeDasharray={style?.dash ?? undefined} fill="none"
                        filter={isTraced ? 'url(#glow)' : undefined} />
                  {ct && (scale > 0.5 || isTraced) && (
                    <g>
                      <rect x={mx - 22} y={my - 8} width="44" height="14" rx="3" fill="rgba(10,10,10,0.85)" stroke={color} strokeWidth="0.5" />
                      <text x={mx} y={my + 2.5} textAnchor="middle" fontSize="9" fill={color} fontFamily="monospace" fontWeight="600">
                        {style?.label ?? ct}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Marquee */}
            {drag.kind === 'marquee' && (
              <rect
                x={Math.min(drag.startX, drag.curX)}
                y={Math.min(drag.startY, drag.curY)}
                width={Math.abs(drag.curX - drag.startX)}
                height={Math.abs(drag.curY - drag.startY)}
                fill="rgba(59,130,246,0.08)"
                stroke="rgba(59,130,246,0.8)"
                strokeWidth="1"
                strokeDasharray="4 2"
              />
            )}
          </svg>

          {/* Devices */}
          {devices.map(d => {
            if (!isDeviceVisible(d)) return null;
            const color = TYPE_COLORS[d.type];
            const isSelected = selectedIds.has(d.id);
            const isTraceTarget = traceId === d.id;
            const isTraced = traced.devices.has(d.id);
            const isDim = traceId && !isTraced;
            const w = deviceWidth(d);
            const h = deviceHeight(d, visibleLayerIds);

            const inVis = visiblePorts(d, 'in', visibleLayerIds);
            const outVis = visiblePorts(d, 'out', visibleLayerIds);

            return (
              <div
                key={d.id}
                data-device-id={d.id}
                onMouseDown={e => onDeviceMouseDown(e, d)}
                onClick={e => onDeviceClickView(e, d)}
                className="absolute rounded-lg"
                style={{
                  left: d.x, top: d.y, width: w, minHeight: h,
                  background: `linear-gradient(180deg, ${color.bg} 0%, rgba(10,10,10,0.9) 100%)`,
                  border: `1.5px solid ${isSelected ? '#fbbf24' : isTraceTarget ? color.glow : editMode ? 'rgba(245,158,11,0.35)' : color.border}`,
                  boxShadow: isSelected ? '0 0 20px rgba(251,191,36,0.5), inset 0 0 0 1px rgba(251,191,36,0.6)'
                            : isTraceTarget ? `0 0 24px ${color.glow}66, inset 0 0 0 1px ${color.glow}55`
                            : '0 2px 8px rgba(0,0,0,0.4)',
                  opacity: isDim ? 0.3 : 1,
                  cursor: editMode ? 'move' : 'pointer',
                  backdropFilter: 'blur(6px)',
                }}
              >
                {/* Header */}
                <div className="px-3 h-[44px] flex items-center gap-2 border-b" style={{ borderColor: color.border }}>
                  <div className="w-1.5 h-4 rounded-full" style={{ background: color.main }}></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate text-white">{d.name}</div>
                    <div className="text-[9px] text-neutral-500 uppercase tracking-wider">{d.type}</div>
                  </div>
                </div>

                {/* Ports */}
                <div className="py-3.5 relative">
                  {/* inputs */}
                  <div className="pr-3">
                    {inVis.map((p, renderIdx) => {
                      const meta = d.inputsMeta?.[p.name];
                      const ct = meta?.connType;
                      const ctStyle = ct ? CONN_TYPE_STYLES[ct] : undefined;
                      const lid = meta?.layerId;
                      const layer = lid ? layerById.get(lid) : undefined;
                      const portColor = layer?.color ?? color.main;
                      return (
                        <div key={p.name} className="flex items-center" style={{ height: PORT_H }}>
                          <button
                            data-port
                            onClick={e => onPortClick(e, d.id, p.name, false)}
                            className="w-2.5 h-2.5 rounded-full -ml-[5px] hover:scale-150 transition-transform"
                            style={{ background: portColor, boxShadow: `0 0 6px ${portColor}` }}
                            title={meta?.label ?? p.name}
                          ></button>
                          <div className="ml-2 flex-1 flex items-center gap-1.5 min-w-0">
                            <span className="text-[10.5px] text-neutral-300 font-mono truncate">{p.name}</span>
                            {ct && (
                              <span className="text-[8.5px] px-1 rounded font-mono"
                                style={{ background: `${portColor}15`, color: portColor, border: `0.5px solid ${portColor}66` }}>
                                {ctStyle?.label ?? ct}
                              </span>
                            )}
                            {meta?.label && <span className="text-[9px] text-neutral-500 truncate">{meta.label}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* outputs */}
                  <div className="absolute top-3.5 right-0 pl-3 w-full pointer-events-none">
                    {outVis.map((p, renderIdx) => {
                      const meta = d.outputsMeta?.[p.name];
                      const ct = meta?.connType;
                      const ctStyle = ct ? CONN_TYPE_STYLES[ct] : undefined;
                      const lid = meta?.layerId;
                      const layer = lid ? layerById.get(lid) : undefined;
                      const portColor = layer?.color ?? color.main;
                      return (
                        <div key={p.name} className="flex items-center justify-end pointer-events-auto" style={{ height: PORT_H }}>
                          <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0 mr-2">
                            {meta?.label && <span className="text-[9px] text-neutral-500 truncate text-right">{meta.label}</span>}
                            {ct && (
                              <span className="text-[8.5px] px-1 rounded font-mono"
                                style={{ background: `${portColor}15`, color: portColor, border: `0.5px solid ${portColor}66` }}>
                                {ctStyle?.label ?? ct}
                              </span>
                            )}
                            <span className="text-[10.5px] text-neutral-300 font-mono truncate">{p.name}</span>
                          </div>
                          <button
                            data-port
                            onClick={e => onPortClick(e, d.id, p.name, true)}
                            className="w-2.5 h-2.5 rounded-full -mr-[5px] hover:scale-150 transition-transform"
                            style={{
                              background: pendingFrom?.device === d.id && pendingFrom?.port === p.name ? '#fbbf24' : portColor,
                              boxShadow: `0 0 6px ${portColor}`,
                            }}
                            title={meta?.label ?? p.name}
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
        <div className="absolute bottom-4 right-4 z-20 bg-neutral-900/85 backdrop-blur border border-neutral-800 rounded-lg p-1 flex flex-col gap-0.5" data-ui>
          <button onClick={() => setScale(s => Math.min(2, s * 1.2))} className="w-8 h-8 hover:bg-neutral-800 rounded text-sm">＋</button>
          <div className="text-[10px] text-center text-neutral-500 py-1">{Math.round(scale * 100)}%</div>
          <button onClick={() => setScale(s => Math.max(0.15, s / 1.2))} className="w-8 h-8 hover:bg-neutral-800 rounded text-sm">−</button>
          <button onClick={() => { setScale(0.7); setOffset({ x: 40, y: 60 }); }} className="w-8 h-8 hover:bg-neutral-800 rounded text-[10px]">⊡</button>
        </div>
      </div>

      {editingDevice && (
        <DeviceEditor
          device={editingDevice}
          layers={layers}
          onSave={handleSaveDevice}
          onDelete={handleDeleteDevice}
          onClose={() => setEditingDevice(null)}
        />
      )}
    </div>
  );
}
