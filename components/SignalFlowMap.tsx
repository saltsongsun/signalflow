'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, Device, Connection, ConnectionType, Layer, DEFAULT_LAYERS, DEVICE_ROLE_LABELS } from '../lib/supabase';
import { INITIAL_DEVICES, INITIAL_CONNECTIONS, TYPE_COLORS, CONN_TYPE_STYLES } from '../lib/initialData';
import DeviceEditor from './DeviceEditor';
import LayerPanel from './LayerPanel';
import CableEditor from './CableEditor';
import PatchbayManager from './PatchbayManager';
import WallboxManager from './WallboxManager';

type TraceMode = 'both' | 'upstream' | 'downstream';

const PORT_H = 22;
const HEADER_H = 50;
const PADDING_Y = 14;
const DRAG_THRESHOLD = 4;

// 패치베이 2단 렌더링 치수
const PB_JACK_W = 36;      // 각 잭 셀 너비
const PB_JACK_H = 34;      // 각 잭 셀 높이
const PB_ROW_GAP = 6;      // OUT 행과 IN 행 사이 간격
const PB_SIDE_PAD = 10;    // 좌우 여백
const PB_TOP_PAD = 8;      // 잭 영역 상단 여백

function deviceWidth(d: Device) {
  // 패치베이는 포트 수 × 잭 너비로 자동
  if (d.role === 'patchbay') {
    const maxPorts = Math.max(d.inputs.length, d.outputs.length);
    return Math.max(220, PB_SIDE_PAD * 2 + maxPorts * PB_JACK_W);
  }
  return d.width ?? 200;
}

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
  // 패치베이: 헤더 + 외부패딩(6*2) + 내부패딩(6*2) + OUT행 + 중간라벨 + IN행
  if (d.role === 'patchbay') {
    return HEADER_H + 12 + 12 + PB_JACK_H + PB_ROW_GAP + PB_JACK_H;
  }
  const vi = visiblePorts(d, 'in', visibleLayerIds).length;
  const vo = visiblePorts(d, 'out', visibleLayerIds).length;
  const portCount = Math.max(vi, vo, 1);
  return HEADER_H + PADDING_Y * 2 + portCount * PORT_H;
}

// 일반 장비용 포트 Y
function portYFromRenderIdx(d: Device, renderIdx: number) {
  return d.y + HEADER_H + PADDING_Y + renderIdx * PORT_H + PORT_H / 2;
}

// 패치베이 전용: 포트 X/Y 계산 (셀 중앙 좌표)
// dir: 'out' = 상단 행 / 'in' = 하단 행
function patchbayPortXY(d: Device, dir: 'in' | 'out', portIdx: number) {
  // 바깥패딩 6 + 안쪽패딩 8 = 14, cell center = 14 + portIdx*JACK_W + JACK_W/2
  const cx = d.x + 14 + portIdx * PB_JACK_W + PB_JACK_W / 2;
  if (dir === 'out') {
    // OUT 잭 상단부 ≈ 헤더 아래 + 6(바깥) + 6(안쪽) + 2 (잭 margintop) = HEADER_H + 14
    const cy = d.y + HEADER_H + 14;
    return { x: cx, y: cy };
  } else {
    // IN 잭 하단부 ≈ HEADER_H + 14 + JACK_H + ROW_GAP + JACK_H
    const cy = d.y + HEADER_H + 14 + PB_JACK_H + PB_ROW_GAP + PB_JACK_H;
    return { x: cx, y: cy };
  }
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
  const [editingCable, setEditingCable] = useState<Connection | null>(null);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showPatchbayMgr, setShowPatchbayMgr] = useState(false);
  const [showWallboxMgr, setShowWallboxMgr] = useState(false);
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
      // 편집모드에서 빈 공간 클릭은 다중선택 해제. 보기모드에서는 trace 유지.
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

  const handleDuplicateDevice = async () => {
    if (!editingDevice) return;
    const src = editingDevice;
    const id = `${src.id}_copy_${Date.now().toString(36)}`;
    const clone: Device = {
      ...src,
      id,
      name: `${src.name} 복사`,
      x: src.x + 40,
      y: src.y + 40,
      // 연결은 복제 안함 (Connection은 장비에 종속이고, from/to 모두 src를 가리키기 때문)
      // 포트 정보, 레이어, 역할, normals, pgmPort 등은 다 복사 — 그대로 깊은 복사
      inputs: [...src.inputs],
      outputs: [...src.outputs],
      inputsMeta: src.inputsMeta ? JSON.parse(JSON.stringify(src.inputsMeta)) : {},
      outputsMeta: src.outputsMeta ? JSON.parse(JSON.stringify(src.outputsMeta)) : {},
      physPorts: { ...src.physPorts },
      routing: { ...src.routing },
      normals: src.normals ? { ...src.normals } : undefined,
    };
    await (supabase as any).from('devices').insert(clone);
    setEditingDevice(clone);
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

  // ========== 정렬 기능 ==========
  type AlignType = 'left' | 'right' | 'top' | 'bottom' | 'center-x' | 'center-y' | 'dist-x' | 'dist-y';

  const handleAlign = async (kind: AlignType) => {
    if (selectedIds.size < 2) return;
    const sel = Array.from(selectedIds)
      .map(id => devices.find(d => d.id === id))
      .filter(Boolean) as Device[];
    if (sel.length < 2) return;

    const widths = sel.map(d => deviceWidth(d));
    const heights = sel.map(d => deviceHeight(d, visibleLayerIds));
    const lefts = sel.map(d => d.x);
    const rights = sel.map((d, i) => d.x + widths[i]);
    const tops = sel.map(d => d.y);
    const bottoms = sel.map((d, i) => d.y + heights[i]);
    const centersX = sel.map((d, i) => d.x + widths[i] / 2);
    const centersY = sel.map((d, i) => d.y + heights[i] / 2);

    const newPositions = new Map<string, { x: number; y: number }>();

    if (kind === 'left') {
      const minLeft = Math.min(...lefts);
      sel.forEach(d => newPositions.set(d.id, { x: minLeft, y: d.y }));
    } else if (kind === 'right') {
      const maxRight = Math.max(...rights);
      sel.forEach((d, i) => newPositions.set(d.id, { x: maxRight - widths[i], y: d.y }));
    } else if (kind === 'top') {
      const minTop = Math.min(...tops);
      sel.forEach(d => newPositions.set(d.id, { x: d.x, y: minTop }));
    } else if (kind === 'bottom') {
      const maxBottom = Math.max(...bottoms);
      sel.forEach((d, i) => newPositions.set(d.id, { x: d.x, y: maxBottom - heights[i] }));
    } else if (kind === 'center-x') {
      const avg = centersX.reduce((a, b) => a + b, 0) / centersX.length;
      sel.forEach((d, i) => newPositions.set(d.id, { x: avg - widths[i] / 2, y: d.y }));
    } else if (kind === 'center-y') {
      const avg = centersY.reduce((a, b) => a + b, 0) / centersY.length;
      sel.forEach((d, i) => newPositions.set(d.id, { x: d.x, y: avg - heights[i] / 2 }));
    } else if (kind === 'dist-x') {
      // 가로 방향 균등 분배 (양 끝 위치 고정, 중간 장비를 균등 간격으로)
      if (sel.length < 3) return;
      const sorted = [...sel].sort((a, b) => a.x - b.x);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const firstW = deviceWidth(first);
      const totalSpan = (last.x + deviceWidth(last)) - first.x;
      const sumW = sorted.reduce((acc, d) => acc + deviceWidth(d), 0);
      const gap = (totalSpan - sumW) / (sorted.length - 1);
      let cursor = first.x;
      sorted.forEach(d => {
        newPositions.set(d.id, { x: cursor, y: d.y });
        cursor += deviceWidth(d) + gap;
      });
    } else if (kind === 'dist-y') {
      if (sel.length < 3) return;
      const sorted = [...sel].sort((a, b) => a.y - b.y);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalSpan = (last.y + deviceHeight(last, visibleLayerIds)) - first.y;
      const sumH = sorted.reduce((acc, d) => acc + deviceHeight(d, visibleLayerIds), 0);
      const gap = (totalSpan - sumH) / (sorted.length - 1);
      let cursor = first.y;
      sorted.forEach(d => {
        newPositions.set(d.id, { x: d.x, y: cursor });
        cursor += deviceHeight(d, visibleLayerIds) + gap;
      });
    }

    // 낙관적 업데이트
    setDevices(prev => prev.map(d => {
      const pos = newPositions.get(d.id);
      return pos ? { ...d, x: pos.x, y: pos.y } : d;
    }));

    // DB 저장
    const updates = Array.from(newPositions.entries()).map(([id, pos]) =>
      (supabase as any).from('devices').update({ x: pos.x, y: pos.y }).eq('id', id)
    );
    await Promise.all(updates);
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

          <button
            onClick={() => setShowPatchbayMgr(true)}
            className="px-3 py-1.5 text-[11px] font-medium rounded-lg border bg-white/5 border-teal-500/30 text-teal-300 hover:text-white hover:bg-teal-500/20 transition-all"
            title="패치베이 관리 페이지"
          >⊟ 패치베이 <span className="font-mono opacity-70">{devices.filter(d => d.role === 'patchbay').length}</span></button>

          <button
            onClick={() => setShowWallboxMgr(true)}
            className="px-3 py-1.5 text-[11px] font-medium rounded-lg border bg-white/5 border-amber-500/30 text-amber-300 hover:text-white hover:bg-amber-500/20 transition-all"
            title="월박스 관리 페이지"
          >▦ 월박스 <span className="font-mono opacity-70">{devices.filter(d => d.role === 'wallbox').length}</span></button>

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
              {selectedIds.size >= 2 && (
                <div className="flex items-center gap-0.5 bg-purple-500/10 border border-purple-500/30 rounded-lg p-0.5" title="선택된 장비 정렬">
                  <button onClick={() => handleAlign('left')} className="w-7 h-7 text-[14px] hover:bg-purple-500/30 rounded text-purple-200 hover:text-white transition flex items-center justify-center" title="왼쪽 정렬">⊣</button>
                  <button onClick={() => handleAlign('center-x')} className="w-7 h-7 text-[14px] hover:bg-purple-500/30 rounded text-purple-200 hover:text-white transition flex items-center justify-center" title="가로 중앙">╎</button>
                  <button onClick={() => handleAlign('right')} className="w-7 h-7 text-[14px] hover:bg-purple-500/30 rounded text-purple-200 hover:text-white transition flex items-center justify-center" title="오른쪽 정렬">⊢</button>
                  <div className="w-px h-4 bg-purple-500/30 mx-0.5"></div>
                  <button onClick={() => handleAlign('top')} className="w-7 h-7 text-[14px] hover:bg-purple-500/30 rounded text-purple-200 hover:text-white transition flex items-center justify-center" title="위쪽 정렬">⊤</button>
                  <button onClick={() => handleAlign('center-y')} className="w-7 h-7 text-[14px] hover:bg-purple-500/30 rounded text-purple-200 hover:text-white transition flex items-center justify-center" title="세로 중앙">─</button>
                  <button onClick={() => handleAlign('bottom')} className="w-7 h-7 text-[14px] hover:bg-purple-500/30 rounded text-purple-200 hover:text-white transition flex items-center justify-center" title="아래쪽 정렬">⊥</button>
                  {selectedIds.size >= 3 && (
                    <>
                      <div className="w-px h-4 bg-purple-500/30 mx-0.5"></div>
                      <button onClick={() => handleAlign('dist-x')} className="w-7 h-7 text-[11px] hover:bg-purple-500/30 rounded text-purple-200 hover:text-white transition font-bold flex items-center justify-center" title="가로 균등 분배">⇔</button>
                      <button onClick={() => handleAlign('dist-y')} className="w-7 h-7 text-[11px] hover:bg-purple-500/30 rounded text-purple-200 hover:text-white transition font-bold flex items-center justify-center" title="세로 균등 분배">⇕</button>
                    </>
                  )}
                </div>
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
            <div><kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-400 font-mono text-[9px]">케이블 클릭</kbd> tie-line/patch</div>
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
          <svg width="4000" height="3000" className="absolute inset-0" style={{ overflow: 'visible', pointerEvents: 'none' }}>
            <defs>
              <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              <filter id="glow-strong"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>
            {connections.map(c => {
              if (!isConnVisible(c)) return null;
              // self-loop 패치(패치베이 내부 패치)는 메인 캔버스에 렌더 안함
              if (c.from_device === c.to_device && c.is_patch) return null;
              const from = devById.get(c.from_device)!;
              const to = devById.get(c.to_device)!;
              const outVis = visiblePorts(from, 'out', visibleLayerIds);
              const inVis = visiblePorts(to, 'in', visibleLayerIds);
              const fi = outVis.findIndex(p => p.name === c.from_port);
              const ti = inVis.findIndex(p => p.name === c.to_port);
              if (fi < 0 || ti < 0) return null;

              // 케이블 출발점 (from의 출력)
              let x1: number, y1: number;
              if (from.role === 'patchbay') {
                // 패치베이의 OUT은 상단 - 위로 빠져나감
                const p = patchbayPortXY(from, 'out', fi);
                x1 = p.x; y1 = p.y;
              } else {
                x1 = from.x + deviceWidth(from);
                y1 = portYFromRenderIdx(from, fi);
              }

              // 케이블 도착점 (to의 입력)
              let x2: number, y2: number;
              if (to.role === 'patchbay') {
                // 패치베이의 IN은 하단 - 아래에서 들어옴
                const p = patchbayPortXY(to, 'in', ti);
                x2 = p.x; y2 = p.y;
              } else {
                x2 = to.x;
                y2 = portYFromRenderIdx(to, ti);
              }

              // 경로 계산 - 패치베이 관련이면 수직 베지어, 아니면 수평
              let path: string;
              const fromIsPatchbay = from.role === 'patchbay';
              const toIsPatchbay = to.role === 'patchbay';
              if (fromIsPatchbay && toIsPatchbay) {
                // 둘 다 패치베이: OUT(위)↑에서 나가 IN(아래)↓로 들어감
                const offsetV = Math.max(40, Math.abs(y2 - y1) / 3);
                path = `M ${x1} ${y1} C ${x1} ${y1 - offsetV}, ${x2} ${y2 + offsetV}, ${x2} ${y2}`;
              } else if (fromIsPatchbay) {
                // from만 패치베이: 위로 빠져나간 뒤 옆으로
                const offsetV = Math.max(30, Math.abs(y2 - y1) / 4);
                const dxc = Math.max(40, Math.abs(x2 - x1) / 2);
                path = `M ${x1} ${y1} C ${x1} ${y1 - offsetV}, ${x2 - dxc} ${y2}, ${x2} ${y2}`;
              } else if (toIsPatchbay) {
                // to만 패치베이: 옆으로 가다가 아래로 들어감
                const offsetV = Math.max(30, Math.abs(y2 - y1) / 4);
                const dxc = Math.max(40, Math.abs(x2 - x1) / 2);
                path = `M ${x1} ${y1} C ${x1 + dxc} ${y1}, ${x2} ${y2 + offsetV}, ${x2} ${y2}`;
              } else {
                const dx = Math.max(60, Math.abs(x2 - x1) / 2);
                path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
              }
              const isTraced = traced.connections.has(c.id);
              const isDim = traceId && !isTraced;
              const ct = c.conn_type ?? from.outputsMeta?.[c.from_port]?.connType;
              const style = ct ? CONN_TYPE_STYLES[ct] : undefined;
              const fromLayerId = from.outputsMeta?.[c.from_port]?.layerId;
              const layerColor = fromLayerId ? layerById.get(fromLayerId)?.color : undefined;
              const color = layerColor ?? (from.type === 'audio' ? TYPE_COLORS.audio.main : from.type === 'combined' ? TYPE_COLORS.combined.main : TYPE_COLORS.video.main);
              const isPgm = from.role === 'switcher' && from.pgmPort === c.from_port;
              const isPatch = c.is_patch === true;
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;

              // 패치 케이블은 주황색으로 오버라이드
              const cableColor = isPatch ? '#F97316' : color;
              const cableDash = isPatch ? '5 4' : (style?.dash ?? undefined);

              return (
                <g key={c.id} opacity={isDim ? 0.1 : 1} style={{ pointerEvents: 'none' }}>
                  {(isTraced || isPgm || isPatch) && (
                    <path d={path} stroke={cableColor} strokeWidth={isPgm ? 7 : 6} fill="none"
                          opacity={isPgm ? 0.35 : isPatch ? 0.3 : 0.25} filter="url(#glow-strong)" />
                  )}
                  {/* 베이스 라인 */}
                  <path d={path} stroke={cableColor} strokeWidth={isPgm ? 3 : isTraced ? 2.5 : isPatch ? 2 : 1.4}
                        strokeDasharray={cableDash} fill="none"
                        opacity={isTraced || isPgm || isPatch ? 1 : 0.55}
                        filter={isTraced || isPgm ? 'url(#glow)' : undefined} />
                  {/* 흐름 애니메이션 오버레이 */}
                  <path
                    d={path}
                    stroke={cableColor}
                    strokeWidth={isPgm ? 3 : isTraced ? 2.5 : isPatch ? 2 : 1.4}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray="6 12"
                    className="flow-line"
                    style={{
                      filter: isTraced || isPgm || isPatch ? 'drop-shadow(0 0 3px currentColor)' : undefined,
                      animationDuration: isPatch ? '0.9s' : isTraced || isPgm ? '1.2s' : '2.8s',
                      opacity: isTraced || isPgm || isPatch ? 1 : 0.85,
                    }}
                  />
                  {/* 편집모드에선 클릭 가능한 넓은 투명 path (선 hit area) */}
                  {editMode && (
                    <path
                      d={path} stroke="transparent" strokeWidth={18} fill="none"
                      style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                      onClick={e => { e.stopPropagation(); setEditingCable(c); }}
                    />
                  )}
                  {/* 연결방식 라벨 */}
                  {ct && (scale > 0.5 || isTraced || isPgm || isPatch) && (
                    <g>
                      <rect x={mx - 24} y={my - 8.5} width="48" height="15" rx="4" fill="rgba(8,8,10,0.92)" stroke={cableColor} strokeWidth="0.6" />
                      <text x={mx} y={my + 2.8} textAnchor="middle" fontSize="9.5" fill={cableColor} fontFamily="var(--font-mono)" fontWeight="700" letterSpacing="0.02em">
                        {style?.label ?? ct}
                      </text>
                    </g>
                  )}
                  {/* Tie-Line 번호 */}
                  {c.tie_line && (scale > 0.4 || isTraced) && (
                    <g>
                      <rect x={mx - 30} y={my + 8} width="60" height="12" rx="3" fill="rgba(20,15,5,0.92)" stroke="#F59E0B" strokeWidth="0.5" />
                      <text x={mx} y={my + 17} textAnchor="middle" fontSize="8.5" fill="#FCD34D" fontFamily="var(--font-mono)" fontWeight="700">
                        {c.tie_line}
                      </text>
                    </g>
                  )}
                  {/* Patch 뱃지 */}
                  {isPatch && scale > 0.45 && (
                    <g>
                      <rect x={mx - 22} y={my - 22} width="44" height="11" rx="2.5" fill="#F97316" opacity="0.95" />
                      <text x={mx} y={my - 14} textAnchor="middle" fontSize="7.5" fill="white" fontFamily="var(--font-mono)" fontWeight="800" letterSpacing="0.05em">
                        PATCH
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
            const roleIcon = role === 'switcher' ? '⇆' : role === 'router' ? '⇅' : role === 'splitter' ? '⇶' : role === 'patchbay' ? '⊟' : role === 'wallbox' ? '▦' : null;
            const isPatchbay = role === 'patchbay';
            const isWallbox = role === 'wallbox';

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
                  background: isPatchbay
                    ? `linear-gradient(165deg, rgba(20,184,166,0.15) 0%, rgba(8,12,12,0.96) 40%, rgba(4,6,6,0.98) 100%)`
                    : isWallbox
                    ? `linear-gradient(165deg, rgba(245,158,11,0.12) 0%, rgba(12,10,6,0.96) 40%, rgba(6,4,2,0.98) 100%)`
                    : `linear-gradient(165deg, ${color.bg} 0%, rgba(10,10,12,0.96) 40%, rgba(4,4,6,0.98) 100%)`,
                  border: `${borderWidth}px solid ${isPatchbay && !isSelected && !isTraceTarget ? 'rgba(20,184,166,0.4)' : isWallbox && !isSelected && !isTraceTarget ? 'rgba(245,158,11,0.4)' : borderColor}`,
                  boxShadow: isSelected
                    ? `0 0 0 1px rgba(251,191,36,0.4), 0 0 30px rgba(251,191,36,0.45), 0 10px 30px rgba(0,0,0,0.5)`
                    : isTraceTarget
                    ? `0 0 0 1px ${color.glow}66, 0 0 35px ${color.glow}55, 0 10px 30px rgba(0,0,0,0.5)`
                    : isHovered
                    ? `0 0 24px ${color.glow}30, 0 8px 22px rgba(0,0,0,0.6)`
                    : isPatchbay
                    ? `0 0 18px rgba(20,184,166,0.15), 0 4px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)`
                    : isWallbox
                    ? `0 0 18px rgba(245,158,11,0.12), 0 4px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)`
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
                            background: isWallbox ? 'rgba(245,158,11,0.15)' : isPatchbay ? 'rgba(20,184,166,0.15)' : 'rgba(16,185,129,0.15)',
                            color: isWallbox ? '#FBBF24' : isPatchbay ? '#2DD4BF' : '#34D399',
                            border: `0.5px solid ${isWallbox ? 'rgba(251,191,36,0.4)' : isPatchbay ? 'rgba(45,212,191,0.4)' : 'rgba(52,211,153,0.4)'}`,
                          }}
                          title={DEVICE_ROLE_LABELS[role]}
                        >{roleIcon} {DEVICE_ROLE_LABELS[role]}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0 mt-[1px]">
                      <span className="text-[9px] text-neutral-500 uppercase tracking-[0.1em] font-medium shrink-0">{d.type}</span>
                      {d.model && (
                        <>
                          <span className="text-neutral-700 text-[8px]">·</span>
                          <span className="text-[9.5px] font-mono text-neutral-400/90 truncate" title={d.model}>
                            {d.model}
                          </span>
                        </>
                      )}
                      {isWallbox && d.location && (
                        <>
                          <span className="text-neutral-700 text-[8px]">·</span>
                          <span className="text-[9.5px] text-amber-300/90 truncate font-medium" title={`${d.location}${d.roomNumber ? ' · ' + d.roomNumber : ''}`}>
                            📍 {d.location}
                          </span>
                        </>
                      )}
                      {isWallbox && d.roomNumber && (
                        <span className="text-[8.5px] px-1 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0" title="방번호">
                          {d.roomNumber}
                        </span>
                      )}
                    </div>
                  </div>
                  {editMode && (
                    <div className="text-[9px] text-neutral-600 font-mono opacity-60 shrink-0">{w}×{Math.round(h)}</div>
                  )}
                </div>

                {/* Ports */}
                {isPatchbay ? (
                  // === 패치베이 1U 랙 바 렌더링 ===
                  <div
                    className="relative"
                    style={{
                      padding: '6px',
                      background: 'linear-gradient(180deg, #2e2e32 0%, #1e1e20 45%, #0e0e10 55%, #1e1e20 100%)',
                      borderTop: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    {/* 내부 검은 잭 영역 */}
                    <div
                      className="relative rounded-sm"
                      style={{
                        padding: '6px 8px',
                        background: 'linear-gradient(180deg, #0a0a0c 0%, #111113 50%, #0a0a0c 100%)',
                        boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.8)',
                        border: '1px solid rgba(0,0,0,0.9)',
                      }}
                    >
                      {/* 상단 행: OUT */}
                      <div className="flex items-center justify-center" style={{ height: PB_JACK_H }}>
                        {d.outputs.map((portName, idx) => {
                          const meta = d.outputsMeta?.[portName];
                          const lid = meta?.layerId;
                          const layer = lid ? layerById.get(lid) : undefined;
                          const portColor = layer?.color ?? color.main;
                          const isPending = pendingFrom?.device === d.id && pendingFrom?.port === portName;
                          const isPgm = d.role === 'switcher' && d.pgmPort === portName;
                          const hasNormal = d.normals && Object.values(d.normals).includes(portName);
                          return (
                            <div
                              key={portName}
                              className="flex flex-col items-center justify-start relative shrink-0"
                              style={{ width: PB_JACK_W, height: PB_JACK_H }}
                              title={`OUT ${idx + 1}: ${portName}${meta?.label ? ` — ${meta.label}` : ''}`}
                            >
                              <button
                                data-port
                                onMouseDown={onPortMouseDown}
                                onClick={e => onPortClick(e, d.id, portName, true)}
                                className={`relative rounded-full transition-transform hover:scale-[1.2] ${isPending ? 'ring-2 ring-amber-300 animate-pulse' : isPgm ? 'ring-2 ring-emerald-400' : ''}`}
                                style={{
                                  width: 20, height: 20,
                                  marginTop: 2,
                                  background: `radial-gradient(circle at 35% 30%, ${isPending ? '#fbbf24' : isPgm ? '#10b981' : portColor} 25%, #000 85%)`,
                                  boxShadow: `
                                    0 0 ${isPgm ? '10px' : '5px'} ${isPending ? '#fbbf24' : isPgm ? '#10b981' : portColor}aa,
                                    inset 0 -1px 2px rgba(0,0,0,0.7),
                                    inset 0 1px 1.5px rgba(255,255,255,0.35)
                                  `,
                                  border: `1px solid ${portColor}aa`,
                                }}
                              >
                                <div
                                  className="absolute inset-0 m-auto rounded-full"
                                  style={{
                                    width: 7, height: 7,
                                    background: 'radial-gradient(circle, #000 35%, #0a0a0a 100%)',
                                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.95)',
                                  }}
                                ></div>
                              </button>
                              {hasNormal && (
                                <div className="absolute top-0 right-0.5 w-1 h-1 rounded-full bg-teal-400"></div>
                              )}
                              <div
                                className="text-center text-[7.5px] font-mono font-bold text-neutral-400 leading-none mt-0.5"
                                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.9)' }}
                              >
                                {String(idx + 1).padStart(2, '0')}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* 중간 라벨 스트립 */}
                      <div
                        className="flex items-center justify-between text-[7.5px] font-bold tracking-[0.15em] px-1"
                        style={{
                          height: PB_ROW_GAP,
                          color: 'rgba(20,184,166,0.6)',
                          background: 'linear-gradient(90deg, rgba(20,184,166,0.05), rgba(20,184,166,0.12), rgba(20,184,166,0.05))',
                          borderTop: '1px solid rgba(20,184,166,0.15)',
                          borderBottom: '1px solid rgba(20,184,166,0.15)',
                        }}
                      >
                        <span>⬆ OUT</span>
                        <span className="text-neutral-600 font-mono tracking-normal">{d.outputs.length}CH</span>
                        <span>IN ⬇</span>
                      </div>

                      {/* 하단 행: IN */}
                      <div className="flex items-center justify-center" style={{ height: PB_JACK_H }}>
                        {d.inputs.map((portName, idx) => {
                          const meta = d.inputsMeta?.[portName];
                          const lid = meta?.layerId;
                          const layer = lid ? layerById.get(lid) : undefined;
                          const portColor = layer?.color ?? color.main;
                          const hasNormal = d.normals?.[portName];
                          return (
                            <div
                              key={portName}
                              className="flex flex-col items-center justify-end relative shrink-0"
                              style={{ width: PB_JACK_W, height: PB_JACK_H }}
                              title={`IN ${idx + 1}: ${portName}${meta?.label ? ` — ${meta.label}` : ''}${hasNormal ? ` · normal → ${hasNormal}` : ''}`}
                            >
                              <div
                                className="text-center text-[7.5px] font-mono font-bold text-neutral-400 leading-none mb-0.5"
                                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.9)' }}
                              >
                                {String(idx + 1).padStart(2, '0')}
                              </div>
                              <button
                                data-port
                                onMouseDown={onPortMouseDown}
                                onClick={e => onPortClick(e, d.id, portName, false)}
                                className="relative rounded-full transition-transform hover:scale-[1.2]"
                                style={{
                                  width: 20, height: 20,
                                  marginBottom: 2,
                                  background: `radial-gradient(circle at 35% 30%, ${portColor} 25%, #000 85%)`,
                                  boxShadow: `
                                    0 0 5px ${portColor}aa,
                                    inset 0 -1px 2px rgba(0,0,0,0.7),
                                    inset 0 1px 1.5px rgba(255,255,255,0.35)
                                  `,
                                  border: `1px solid ${portColor}aa`,
                                }}
                              >
                                <div
                                  className="absolute inset-0 m-auto rounded-full"
                                  style={{
                                    width: 7, height: 7,
                                    background: 'radial-gradient(circle, #000 35%, #0a0a0a 100%)',
                                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.95)',
                                  }}
                                ></div>
                              </button>
                              {hasNormal && (
                                <div className="absolute bottom-0 right-0.5 w-1 h-1 rounded-full bg-teal-400"></div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 관리 페이지 진입 버튼 */}
                    {editMode && (
                      <button
                        onClick={e => { e.stopPropagation(); setShowPatchbayMgr(true); }}
                        onMouseDown={e => e.stopPropagation()}
                        className="absolute top-1.5 right-1.5 text-[9px] px-2 py-0.5 rounded bg-teal-500/20 hover:bg-teal-500 text-teal-300 hover:text-white border border-teal-500/40 font-medium transition"
                        title="패치베이 관리 페이지 열기"
                      >⊟ 관리</button>
                    )}
                  </div>
                ) : (
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
                )}
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

      {showPatchbayMgr && (
        <PatchbayManager
          devices={devices}
          connections={connections}
          layers={layers}
          onClose={() => setShowPatchbayMgr(false)}
        />
      )}

      {showWallboxMgr && (
        <WallboxManager
          devices={devices}
          connections={connections}
          layers={layers}
          onClose={() => setShowWallboxMgr(false)}
          onEditDevice={(d) => { setShowWallboxMgr(false); setEditingDevice(d); }}
        />
      )}

      {editingDevice && (
        <DeviceEditor
          device={editingDevice}
          layers={layers}
          onSave={handleSaveDevice}
          onDelete={handleDeleteDevice}
          onDuplicate={handleDuplicateDevice}
          onClose={() => setEditingDevice(null)}
        />
      )}

      {editingCable && (
        <CableEditor
          connection={editingCable}
          fromName={devById.get(editingCable.from_device)?.name ?? editingCable.from_device}
          toName={devById.get(editingCable.to_device)?.name ?? editingCable.to_device}
          onClose={() => setEditingCable(null)}
          onDelete={async () => {
            await (supabase as any).from('connections').delete().eq('id', editingCable.id);
            setEditingCable(null);
          }}
        />
      )}
    </div>
  );
}
