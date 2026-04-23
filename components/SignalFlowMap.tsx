'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, Device, Connection, ConnectionType, Layer, DEFAULT_LAYERS, DEVICE_ROLE_LABELS } from '../lib/supabase';
import { INITIAL_DEVICES, INITIAL_CONNECTIONS, TYPE_COLORS, CONN_TYPE_STYLES } from '../lib/initialData';
import DeviceEditor from './DeviceEditor';
import LayerPanel from './LayerPanel';

type TraceMode = 'both' | 'upstream' | 'downstream';

const PORT_H = 22;
const HEADER_H = 46;
const PADDING_Y = 14;
const DRAG_THRESHOLD = 4;

function deviceWidth(d: Device) { return d.width ?? 200; }

function visiblePorts(d: Device, dir: 'in' | 'out', visibleLayerIds: Set<string>) {
  const arr = dir === 'in' ? d.inputs : d.outputs;
  const meta = dir === 'in' ? d.inputsMeta : d.outputsMeta;
  return arr
    .map((name, index) => ({ name, index }))
    .filter(p => {
      const lid = meta?.[p.name]?.layerId;
      if (!lid) return true;
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const [scale, setScale] = useState(0.7);
  const [offset, setOffset] = useState({ x: 40, y: 70 });

  // ===== Pointer tracking =====
  // 드래그가 실제로 일어났는지 장비/캔버스마다 판단하기 위한 상태
  const pointerRef = useRef<{
    type: 'none' | 'canvas' | 'device' | 'marquee';
    downX: number;
    downY: number;
    clickedDeviceId?: string;
    shiftKey: boolean;
    moved: boolean;
    // device drag 전용
    origPositions?: Record<string, { x: number; y: number }>;
    dragIds?: string[];
    // canvas 전용
    origOffset?: { x: number; y: number };
    // marquee 전용
    worldStartX?: number;
    worldStartY?: number;
  }>({ type: 'none', downX: 0, downY: 0, shiftKey: false, moved: false });

  const [draggingCursor, setDraggingCursor] = useState<'none' | 'canvas' | 'marquee' | 'device'>('none');
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // state mirror
  const stateRef = useRef({ scale, offset, editMode, devices, selectedIds, visibleLayerIds: new Set<string>(), layers });
  stateRef.current.scale = scale;
  stateRef.current.offset = offset;
  stateRef.current.editMode = editMode;
  stateRef.current.devices = devices;
  stateRef.current.selectedIds = selectedIds;
  stateRef.current.layers = layers;

  // ===== Load data =====
  useEffect(() => {
    (async () => {
      const [devRes, connRes, layerRes] = await Promise.all([
        supabase.from('devices').select('*'),
        supabase.from('connections').select('*'),
        supabase.from('layers').select('*'),
      ]);
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
      setOnline(Object.keys(ch.presenceState()).length || 1);
    });
    ch.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') await ch.track({ user_id: crypto.randomUUID() });
    });
    return () => { (supabase as any).removeChannel(ch); };
  }, []);

  const devById = useMemo(() => new Map(devices.map(d => [d.id, d])), [devices]);
  const visibleLayerIds = useMemo(() => new Set(layers.filter(l => l.visible).map(l => l.id)), [layers]);
  stateRef.current.visibleLayerIds = visibleLayerIds;
  const layerById = useMemo(() => new Map(layers.map(l => [l.id, l])), [layers]);

  const isDeviceVisible = (d: Device): boolean => {
    const hasAny = d.inputs.length + d.outputs.length > 0;
    if (!hasAny) return true;
    return visiblePorts(d, 'in', visibleLayerIds).length + visiblePorts(d, 'out', visibleLayerIds).length > 0;
  };
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

  // ===== Global window listeners =====
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const p = pointerRef.current;
      if (p.type === 'none') return;

      const dx = e.clientX - p.downX;
      const dy = e.clientY - p.downY;

      if (p.type === 'canvas' && p.origOffset) {
        setOffset({ x: p.origOffset.x + dx, y: p.origOffset.y + dy });
        if (!p.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
          p.moved = true;
        }
      } else if (p.type === 'device' && p.origPositions) {
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          if (!p.moved) {
            p.moved = true;
            setDraggingCursor('device');
          }
          const sc = stateRef.current.scale;
          const worldDx = dx / sc;
          const worldDy = dy / sc;
          const origs = p.origPositions;
          setDevices(prev => prev.map(dev => {
            const orig = origs[dev.id];
            if (orig) return { ...dev, x: orig.x + worldDx, y: orig.y + worldDy };
            return dev;
          }));
        }
      } else if (p.type === 'marquee' && p.worldStartX !== undefined && p.worldStartY !== undefined) {
        const sc = stateRef.current.scale;
        const off = stateRef.current.offset;
        const wx = (e.clientX - off.x) / sc;
        const wy = (e.clientY - off.y) / sc;
        const minX = Math.min(p.worldStartX, wx);
        const minY = Math.min(p.worldStartY, wy);
        setMarqueeRect({ x: minX, y: minY, w: Math.abs(wx - p.worldStartX), h: Math.abs(wy - p.worldStartY) });
        p.moved = true;
      }
    };

    const onUp = async () => {
      const p = pointerRef.current;
      if (p.type === 'none') return;

      if (p.type === 'device') {
        if (p.moved) {
          // 저장
          const latestDevices = stateRef.current.devices;
          const ids = p.dragIds ?? [];
          const saves = ids.map(id => {
            const latest = latestDevices.find(x => x.id === id);
            return latest ? (supabase as any).from('devices').update({ x: latest.x, y: latest.y }).eq('id', id) : null;
          }).filter(Boolean);
          await Promise.all(saves);
        } else {
          // 클릭으로 판정
          const clickedId = p.clickedDeviceId!;
          const clickedDev = stateRef.current.devices.find(x => x.id === clickedId);
          if (clickedDev) {
            if (stateRef.current.editMode) {
              if (p.shiftKey) {
                setSelectedIds(prev => {
                  const next = new Set(prev);
                  if (next.has(clickedId)) next.delete(clickedId);
                  else next.add(clickedId);
                  return next;
                });
              } else {
                setSelectedIds(new Set([clickedId]));
                setEditingDevice(clickedDev);
              }
            } else {
              setTraceId(t => t === clickedId ? null : clickedId);
            }
          }
        }
      } else if (p.type === 'marquee' && p.worldStartX !== undefined && p.worldStartY !== undefined) {
        if (p.moved && marqueeRect) {
          const vis = stateRef.current.visibleLayerIds;
          const inside = stateRef.current.devices.filter(dev => {
            if (dev.inputs.length + dev.outputs.length > 0) {
              const vi = visiblePorts(dev, 'in', vis).length;
              const vo = visiblePorts(dev, 'out', vis).length;
              if (vi + vo === 0) return false;
            }
            const w = deviceWidth(dev);
            const h = deviceHeight(dev, vis);
            return dev.x < marqueeRect.x + marqueeRect.w && dev.x + w > marqueeRect.x
                && dev.y < marqueeRect.y + marqueeRect.h && dev.y + h > marqueeRect.y;
          }).map(dev => dev.id);
          setSelectedIds(new Set(inside));
        }
        setMarqueeRect(null);
      }

      pointerRef.current = { type: 'none', downX: 0, downY: 0, shiftKey: false, moved: false };
      setDraggingCursor('none');
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [marqueeRect]);

  // ===== Canvas mousedown =====
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-device-id], [data-port], [data-ui]')) return;

    if (editMode && e.shiftKey) {
      const wx = (e.clientX - offset.x) / scale;
      const wy = (e.clientY - offset.y) / scale;
      pointerRef.current = {
        type: 'marquee',
        downX: e.clientX, downY: e.clientY,
        shiftKey: true, moved: false,
        worldStartX: wx, worldStartY: wy,
      };
      setDraggingCursor('marquee');
      setMarqueeRect({ x: wx, y: wy, w: 0, h: 0 });
    } else {
      pointerRef.current = {
        type: 'canvas',
        downX: e.clientX, downY: e.clientY,
        shiftKey: e.shiftKey, moved: false,
        origOffset: offset,
      };
      setDraggingCursor('canvas');
      // 즉시 선택 해제는 mouseup에서 moved 여부 확인 후 처리 (아래 별도 처리 없이 유지)
      if (!editMode) setTraceId(null);
      if (editMode && !e.shiftKey) setSelectedIds(new Set());
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(2, Math.max(0.15, scale * delta));
    const wx = (mx - offset.x) / scale;
    const wy = (my - offset.y) / scale;
    setScale(newScale);
    setOffset({ x: mx - wx * newScale, y: my - wy * newScale });
  };

  // ===== Device mousedown =====
  const onDeviceMouseDown = (e: React.MouseEvent, d: Device) => {
    e.stopPropagation();
    e.preventDefault();

    if (!editMode) {
      // 보기 모드 — 장비 click으로 trace (onClick 사용)
      return;
    }

    // 편집 모드: 드래그 후보로 등록
    const isInSelection = selectedIds.has(d.id);
    const idsToMove = isInSelection && selectedIds.size > 0 ? Array.from(selectedIds) : [d.id];
    const origPositions: Record<string, { x: number; y: number }> = {};
    idsToMove.forEach(id => {
      const dev = devById.get(id);
      if (dev) origPositions[id] = { x: dev.x, y: dev.y };
    });
    pointerRef.current = {
      type: 'device',
      downX: e.clientX, downY: e.clientY,
      shiftKey: e.shiftKey, moved: false,
      clickedDeviceId: d.id,
      origPositions, dragIds: idsToMove,
    };
  };

  // 보기모드에서만 사용
  const onDeviceClickView = (e: React.MouseEvent, d: Device) => {
    if (editMode) return;
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
        to_device: deviceId, to_port: port,
        conn_type: pendingFrom.connType ?? d.inputsMeta?.[port]?.connType ?? null,
      };
      await (supabase as any).from('connections').delete().eq('to_device', deviceId).eq('to_port', port);
      await (supabase as any).from('connections').insert(newConn);
      setPendingFrom(null);
    }
  };

  // 포트 버튼 mousedown에서 stopPropagation — 포트 클릭이 장비 드래그로 이어지지 않도록
  const onPortMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleAddDevice = async () => {
    const id = `dev_${Date.now().toString(36)}`;
    const defaultLayer = layers[0]?.id ?? 'layer_video';
    const d: Device = {
      id, name: '새 장비', type: 'video', role: 'standard',
      x: (-offset.x + 400) / scale, y: (-offset.y + 200) / scale,
      width: 200, inputs: ['IN-1'], outputs: ['OUT-1'],
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
    await (supabase as any).from('connections').delete().or(`from_device.eq.${editingDevice.id},to_device.eq.${editingDevice.id}`);
    await (supabase as any).from('devices').delete().eq('id', editingDevice.id);
    setEditingDevice(null);
  };
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}개 장비 삭제?`)) return;
    for (const id of Array.from(selectedIds)) {
      await (supabase as any).from('connections').delete().or(`from_device.eq.${id},to_device.eq.${id}`);
      await (supabase as any).from('devices').delete().eq('id', id);
    }
    setSelectedIds(new Set());
  };
  const handleResetAll = async () => {
    if (!confirm('모든 데이터 삭제 후 초기 데이터로 재시드?')) return;
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
    return (
      <div className="h-screen bg-gradient-to-br from-neutral-950 via-black to-neutral-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-neutral-400 text-sm">
          <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          불러오는 중…
        </div>
      </div>
    );
  }

  const cursorClass =
    draggingCursor === 'canvas' ? 'cursor-grabbing'
    : draggingCursor === 'marquee' ? 'cursor-crosshair'
    : draggingCursor === 'device' ? 'cursor-grabbing'
    : 'cursor-grab';

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-neutral-950 via-black to-neutral-950 text-white overflow-hidden relative select-none">
      {/* Top bar */}
      <div data-ui className="absolute top-0 left-0 right-0 z-30 h-14 bg-black/60 backdrop-blur-2xl border-b border-white/10 shadow-xl shadow-black/40">
        <div className="h-full flex items-center gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <div className="relative w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-purple-600 flex items-center justify-center shadow-lg shadow-sky-500/30">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="3" cy="3" r="1.5" fill="white"/>
                <circle cx="13" cy="3" r="1.5" fill="white"/>
                <circle cx="3" cy="13" r="1.5" fill="white"/>
                <circle cx="13" cy="13" r="1.5" fill="white"/>
                <path d="M3 3 L13 13 M13 3 L3 13" stroke="white" strokeWidth="0.8" opacity="0.6"/>
              </svg>
            </div>
            <div>
              <div className="text-[13px] font-bold tracking-tight leading-tight">Signal Flow Map</div>
              <div className="text-[9.5px] text-neutral-500 leading-tight font-mono">경남이스포츠 · UHD</div>
            </div>
          </div>

          <div className="w-px h-7 bg-white/10"></div>

          <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5 border border-white/10">
            <button
              onClick={() => { setEditMode(false); setPendingFrom(null); setSelectedIds(new Set()); }}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-all ${!editMode ? 'bg-gradient-to-r from-neutral-700 to-neutral-600 text-white shadow-md' : 'text-neutral-400 hover:text-white'}`}
            >👁 보기</button>
            <button
              onClick={() => { setEditMode(true); setTraceId(null); }}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-all ${editMode ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30' : 'text-neutral-400 hover:text-white'}`}
            >✎ 편집</button>
          </div>

          <button
            onClick={() => setShowLayerPanel(s => !s)}
            className={`px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${showLayerPanel ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white border-purple-400 shadow-md shadow-purple-500/30' : 'bg-white/5 border-white/10 text-neutral-300 hover:text-white hover:bg-white/10'}`}
          >⧉ 레이어 <span className="font-mono opacity-70">{layers.filter(l => l.visible).length}/{layers.length}</span></button>

          {!editMode && traceId && (
            <div className="flex items-center gap-0.5 bg-sky-500/10 border border-sky-500/30 rounded-lg p-0.5">
              {(['both','upstream','downstream'] as TraceMode[]).map(m => (
                <button key={m} onClick={() => setTraceMode(m)}
                  className={`px-2.5 py-1 text-[10.5px] font-medium rounded-md transition ${traceMode === m ? 'bg-sky-500 text-white' : 'text-sky-300 hover:text-white'}`}
                >{m === 'both' ? '양방향' : m === 'upstream' ? '⬅ 상류' : '하류 ➡'}</button>
              ))}
            </div>
          )}

          {editMode && (
            <>
              <button onClick={handleAddDevice}
                className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white shadow-md shadow-sky-500/30 transition">＋ 장비</button>
              {selectedIds.size > 0 && (
                <>
                  <div className="px-2.5 py-1 text-[11px] rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-medium">
                    {selectedIds.size}개 선택
                  </div>
                  <button onClick={handleDeleteSelected}
                    className="px-2.5 py-1 text-[11px] rounded-lg bg-rose-500/15 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/30 hover:border-rose-400 font-medium transition">삭제</button>
                </>
              )}
              <button onClick={handleResetAll}
                className="px-2.5 py-1.5 text-[11px] rounded-lg bg-white/5 hover:bg-rose-500/80 text-neutral-500 hover:text-white border border-white/10 transition">⟲</button>
            </>
          )}

          <div className="ml-auto flex items-center gap-3 text-[11px]">
            <span className="text-neutral-500 font-mono">{devices.length}D · {connections.length}C</span>
            <div className="w-px h-4 bg-white/10"></div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-md shadow-emerald-400/60"></div>
              <span className="text-emerald-400 font-semibold font-mono">{online}</span>
            </div>
          </div>
        </div>
      </div>

      {showLayerPanel && <LayerPanel layers={layers} onClose={() => setShowLayerPanel(false)} />}

      {pendingFrom && (
        <div data-ui className="absolute top-[68px] left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 backdrop-blur-xl border border-amber-500/40 shadow-2xl shadow-amber-500/20">
          <div className="flex items-center gap-3 text-xs">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
            <div>
              <span className="text-amber-200 font-semibold">연결 대기: </span>
              <span className="text-amber-100 font-mono">{devById.get(pendingFrom.device)?.name} · {pendingFrom.port}</span>
              <span className="text-amber-300/70 ml-2">→ 입력 포트 클릭</span>
            </div>
            <button onClick={() => setPendingFrom(null)} className="ml-2 text-amber-300/70 hover:text-white underline text-[10px]">취소</button>
          </div>
        </div>
      )}

      <div data-ui className="absolute bottom-4 left-4 z-20 bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl px-3 py-2.5 shadow-lg">
        <div className="text-[9.5px] uppercase tracking-[0.12em] text-neutral-500 font-semibold mb-1.5">타입</div>
        <div className="space-y-1 text-[10.5px]">
          <div className="flex items-center gap-2"><div className="w-3 h-2.5 rounded-sm bg-gradient-to-r from-sky-400 to-sky-600 shadow-sm shadow-sky-500/50"></div> <span className="text-neutral-300">Video</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-2.5 rounded-sm bg-gradient-to-r from-rose-400 to-rose-600 shadow-sm shadow-rose-500/50"></div> <span className="text-neutral-300">Audio</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-2.5 rounded-sm bg-gradient-to-r from-purple-400 to-purple-600 shadow-sm shadow-purple-500/50"></div> <span className="text-neutral-300">V + A</span></div>
        </div>
        {editMode && (
          <div className="mt-2.5 pt-2 border-t border-white/10 text-[9.5px] text-neutral-500 space-y-0.5">
            <div><kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-400 font-mono text-[9px]">클릭</kbd> 편집</div>
            <div><kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-400 font-mono text-[9px]">Shift</kbd> 다중선택</div>
            <div><kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-400 font-mono text-[9px]">Shift+드래그</kbd> 박스</div>
          </div>
        )}
      </div>

      {/* Canvas */}
      <div
        className={`absolute inset-0 pt-14 ${cursorClass}`}
        onMouseDown={onCanvasMouseDown}
        onWheel={onWheel}
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(168,85,247,0.015) 0%, transparent 50%), radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: `auto, ${24 * scale}px ${24 * scale}px`,
          backgroundPosition: `0 0, ${offset.x}px ${offset.y}px`,
        }}
      >
        <div style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: '0 0', width: '4000px', height: '3000px', position: 'relative' }}>
          {/* Connections */}
          <svg width="4000" height="3000" className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible' }}>
            <defs>
              <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              <filter id="glow-strong"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>
            {connections.map(c => {
              if (!isConnVisible(c)) return null;
              const from = devById.get(c.from_device)!;
              const to = devById.get(c.to_device)!;
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
              const fromLayerId = from.outputsMeta?.[c.from_port]?.layerId;
              const layerColor = fromLayerId ? layerById.get(fromLayerId)?.color : undefined;
              const color = layerColor ?? (from.type === 'audio' ? TYPE_COLORS.audio.main : from.type === 'combined' ? TYPE_COLORS.combined.main : TYPE_COLORS.video.main);
              const isPgm = from.role === 'switcher' && from.pgmPort === c.from_port;
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;

              return (
                <g key={c.id} opacity={isDim ? 0.1 : 1}>
                  {(isTraced || isPgm) && <path d={path} stroke={color} strokeWidth={isPgm ? 7 : 6} fill="none" opacity={isPgm ? 0.35 : 0.25} filter="url(#glow-strong)" />}
                  {/* 베이스 라인 */}
                  <path d={path} stroke={color} strokeWidth={isPgm ? 3 : isTraced ? 2.5 : 1.4}
                        strokeDasharray={style?.dash ?? undefined} fill="none"
                        opacity={isTraced || isPgm ? 1 : 0.55}
                        filter={isTraced || isPgm ? 'url(#glow)' : undefined} />
                  {/* 흐름 애니메이션 오버레이 - 선 위를 움직이는 점선 */}
                  <path
                    d={path}
                    stroke={color}
                    strokeWidth={isPgm ? 3 : isTraced ? 2.5 : 1.4}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray="6 12"
                    className="flow-line"
                    style={{
                      filter: isTraced || isPgm ? 'drop-shadow(0 0 3px currentColor)' : undefined,
                      animationDuration: isTraced || isPgm ? '1.2s' : '2.8s',
                      opacity: isTraced || isPgm ? 1 : 0.85,
                    }}
                  />
                  {ct && (scale > 0.5 || isTraced || isPgm) && (
                    <g>
                      <rect x={mx - 24} y={my - 8.5} width="48" height="15" rx="4" fill="rgba(8,8,10,0.92)" stroke={color} strokeWidth="0.6" />
                      <text x={mx} y={my + 2.8} textAnchor="middle" fontSize="9.5" fill={color} fontFamily="var(--font-mono)" fontWeight="700" letterSpacing="0.02em">
                        {style?.label ?? ct}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {marqueeRect && (
              <rect
                x={marqueeRect.x} y={marqueeRect.y}
                width={marqueeRect.w} height={marqueeRect.h}
                fill="rgba(59,130,246,0.08)"
                stroke="rgba(59,130,246,0.8)" strokeWidth="1.5"
                strokeDasharray="5 3" rx="4"
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
            const isHovered = hoveredId === d.id;
            const w = deviceWidth(d);
            const h = deviceHeight(d, visibleLayerIds);
            const inVis = visiblePorts(d, 'in', visibleLayerIds);
            const outVis = visiblePorts(d, 'out', visibleLayerIds);
            const role = d.role ?? 'standard';
            const roleIcon = role === 'switcher' ? '⇆' : role === 'router' ? '⇅' : role === 'splitter' ? '⇶' : null;

            const borderColor = isSelected ? '#fbbf24' : isTraceTarget ? color.glow : editMode ? 'rgba(251,191,36,0.35)' : color.border;
            const borderWidth = isSelected || isTraceTarget ? 2 : 1.2;

            return (
              <div
                key={d.id}
                data-device-id={d.id}
                onMouseDown={e => onDeviceMouseDown(e, d)}
                onClick={e => onDeviceClickView(e, d)}
                onMouseEnter={() => setHoveredId(d.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`absolute rounded-xl overflow-hidden transition-[opacity,box-shadow,transform] ${isSelected ? 'device-selected' : ''}`}
                style={{
                  left: d.x, top: d.y, width: w, minHeight: h,
                  background: `linear-gradient(165deg, ${color.bg} 0%, rgba(10,10,12,0.96) 40%, rgba(4,4,6,0.98) 100%)`,
                  border: `${borderWidth}px solid ${borderColor}`,
                  boxShadow: isSelected
                    ? `0 0 0 1px rgba(251,191,36,0.4), 0 0 30px rgba(251,191,36,0.45), 0 10px 30px rgba(0,0,0,0.5)`
                    : isTraceTarget
                    ? `0 0 0 1px ${color.glow}66, 0 0 35px ${color.glow}55, 0 10px 30px rgba(0,0,0,0.5)`
                    : isHovered
                    ? `0 0 24px ${color.glow}30, 0 8px 22px rgba(0,0,0,0.6)`
                    : `0 4px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)`,
                  opacity: isDim ? 0.25 : 1,
                  cursor: editMode ? 'move' : 'pointer',
                  backdropFilter: 'blur(8px)',
                  transform: isHovered && !editMode ? 'translateY(-1px)' : undefined,
                }}
              >
                {/* Header */}
                <div
                  className="px-3.5 flex items-center gap-2 relative"
                  style={{
                    height: HEADER_H,
                    background: `linear-gradient(90deg, ${color.main}22 0%, transparent 60%)`,
                    borderBottom: `1px solid ${color.border}`,
                  }}
                >
                  <div
                    className="w-1 h-5 rounded-full shrink-0"
                    style={{ background: `linear-gradient(180deg, ${color.glow}, ${color.main})`, boxShadow: `0 0 8px ${color.glow}` }}
                  ></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <div className="text-[13px] font-semibold truncate text-white leading-tight tracking-tight">{d.name}</div>
                      {roleIcon && (
                        <span
                          className="text-[9px] px-1 py-[1px] rounded shrink-0 font-mono font-bold"
                          style={{
                            background: 'rgba(16,185,129,0.15)',
                            color: '#34D399',
                            border: '0.5px solid rgba(52,211,153,0.4)',
                          }}
                          title={DEVICE_ROLE_LABELS[role]}
                        >{roleIcon} {DEVICE_ROLE_LABELS[role]}</span>
                      )}
                    </div>
                    <div className="text-[9px] text-neutral-500 uppercase tracking-[0.1em] font-medium">{d.type}</div>
                  </div>
                  {editMode && (
                    <div className="text-[9px] text-neutral-600 font-mono opacity-60 shrink-0">{w}×{Math.round(h)}</div>
                  )}
                </div>

                {/* Ports */}
                <div className="py-3.5 relative">
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
                            onMouseDown={onPortMouseDown}
                            onClick={e => onPortClick(e, d.id, p.name, false)}
                            className="w-3 h-3 rounded-full -ml-[6px] hover:scale-[1.6] transition-transform ring-2 ring-black/40"
                            style={{ background: portColor, boxShadow: `0 0 8px ${portColor}, inset 0 1px 1px rgba(255,255,255,0.3)` }}
                            title={meta?.label ?? p.name}
                          ></button>
                          <div className="ml-2 flex-1 flex items-center gap-1.5 min-w-0">
                            <span className="text-[10.5px] text-neutral-200 font-mono truncate font-medium">{p.name}</span>
                            {ct && (
                              <span className="text-[8.5px] px-1 py-[1px] rounded font-mono font-semibold"
                                style={{ background: `${portColor}20`, color: portColor, border: `0.5px solid ${portColor}55`, boxShadow: `0 0 4px ${portColor}30` }}>
                                {ctStyle?.label ?? ct}
                              </span>
                            )}
                            {meta?.label && <span className="text-[9.5px] text-neutral-500 truncate">{meta.label}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="absolute top-3.5 right-0 pl-3 w-full pointer-events-none">
                    {outVis.map((p, renderIdx) => {
                      const meta = d.outputsMeta?.[p.name];
                      const ct = meta?.connType;
                      const ctStyle = ct ? CONN_TYPE_STYLES[ct] : undefined;
                      const lid = meta?.layerId;
                      const layer = lid ? layerById.get(lid) : undefined;
                      const portColor = layer?.color ?? color.main;
                      const isPending = pendingFrom?.device === d.id && pendingFrom?.port === p.name;
                      const isPgm = d.role === 'switcher' && d.pgmPort === p.name;
                      return (
                        <div key={p.name} className="flex items-center justify-end pointer-events-auto" style={{ height: PORT_H }}>
                          <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0 mr-2">
                            {meta?.label && <span className="text-[9.5px] text-neutral-500 truncate text-right">{meta.label}</span>}
                            {isPgm && (
                              <span className="text-[8.5px] px-1.5 py-[1px] rounded font-mono font-bold"
                                style={{ background: 'linear-gradient(90deg, #10b981, #059669)', color: 'white', boxShadow: '0 0 8px rgba(16,185,129,0.6)' }}>
                                PGM
                              </span>
                            )}
                            {ct && (
                              <span className="text-[8.5px] px-1 py-[1px] rounded font-mono font-semibold"
                                style={{ background: `${portColor}20`, color: portColor, border: `0.5px solid ${portColor}55`, boxShadow: `0 0 4px ${portColor}30` }}>
                                {ctStyle?.label ?? ct}
                              </span>
                            )}
                            <span className="text-[10.5px] text-neutral-200 font-mono truncate font-medium">{p.name}</span>
                          </div>
                          <button
                            data-port
                            onMouseDown={onPortMouseDown}
                            onClick={e => onPortClick(e, d.id, p.name, true)}
                            className={`w-3 h-3 rounded-full -mr-[6px] hover:scale-[1.6] transition-transform ring-2 ${isPending ? 'ring-amber-300/60 animate-pulse' : isPgm ? 'ring-emerald-400/60' : 'ring-black/40'}`}
                            style={{
                              background: isPending ? '#fbbf24' : isPgm ? '#10b981' : portColor,
                              boxShadow: `0 0 ${isPgm ? '12px' : '8px'} ${isPending ? '#fbbf24' : isPgm ? '#10b981' : portColor}, inset 0 1px 1px rgba(255,255,255,0.3)`,
                            }}
                            title={isPgm ? `${p.name} (PGM)` : (meta?.label ?? p.name)}
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
        <div data-ui className="absolute bottom-4 right-4 z-20 bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl p-1 flex flex-col gap-0.5 shadow-lg">
          <button onClick={() => setScale(s => Math.min(2, s * 1.2))} className="w-8 h-8 hover:bg-white/10 rounded-lg text-base transition">＋</button>
          <div className="text-[10px] text-center text-neutral-400 font-mono py-1 border-y border-white/5">{Math.round(scale * 100)}%</div>
          <button onClick={() => setScale(s => Math.max(0.15, s / 1.2))} className="w-8 h-8 hover:bg-white/10 rounded-lg text-base transition">−</button>
          <button onClick={() => { setScale(0.7); setOffset({ x: 40, y: 70 }); }} className="w-8 h-8 hover:bg-white/10 rounded-lg text-[10px] transition" title="초기화">⊡</button>
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
