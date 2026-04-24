'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, Device, Connection, ConnectionType, Layer, DEFAULT_LAYERS, DEVICE_ROLE_LABELS, Rack, MULTIVIEW_LAYOUTS, MultiviewLayoutId } from '../lib/supabase';
import { INITIAL_DEVICES, INITIAL_CONNECTIONS, TYPE_COLORS, CONN_TYPE_STYLES } from '../lib/initialData';
import DeviceEditor from './DeviceEditor';
import LayerPanel from './LayerPanel';
import CableEditor from './CableEditor';
import PatchbayManager from './PatchbayManager';
import WallboxManager from './WallboxManager';
import BulkEditor from './BulkEditor';
import ConnectionCanvas from './ConnectionCanvas';

type TraceMode = 'both' | 'upstream' | 'downstream';

const PORT_H = 28;           // 22 → 28 (포트 행 간격 더 여유)
const HEADER_H = 58;         // 50 → 58 (헤더 여유)
const PADDING_Y = 18;        // 14 → 18 (세로 내부 패딩)
const DRAG_THRESHOLD = 4;

// 패치베이 2단 렌더링 치수
const PB_JACK_W = 36;      // 각 잭 셀 너비
const PB_JACK_H = 34;      // 각 잭 셀 높이
const PB_ROW_GAP = 6;      // OUT 행과 IN 행 사이 간격
const PB_SIDE_PAD = 10;    // 좌우 여백
const PB_TOP_PAD = 8;      // 잭 영역 상단 여백

function deviceWidth(d: Device) {
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
  const vi = visiblePorts(d, 'in', visibleLayerIds).length;
  const vo = visiblePorts(d, 'out', visibleLayerIds).length;
  const portCount = Math.max(vi, vo, 1);
  let h = HEADER_H + PADDING_Y * 2 + portCount * PORT_H;
  const w = d.width ?? 200;
  const videoBoxH = Math.round((w - 20) * 9 / 16);
  const audioRowH = 34;
  // source: 이미지(video/combined) + 오디오(audio/combined)
  if (d.role === 'source') {
    if (d.imageUrl && (d.type === 'video' || d.type === 'combined')) h += videoBoxH + 6;
    if (d.audioUrl && (d.type === 'audio' || d.type === 'combined')) h += audioRowH + 6;
    if ((d.imageUrl || d.audioUrl)) h += 6; // outer margin
  }
  // display: type에 따라 비디오 영역 + 오디오 영역
  if (d.role === 'display') {
    if (d.type === 'video' || d.type === 'combined') h += videoBoxH + 6;
    if (d.type === 'audio' || d.type === 'combined') h += audioRowH + 6;
    h += 6;
  }
  // multiview: PGM/PVW + 소스 셀 그리드
  if (d.role === 'multiview') {
    const layoutId = (d.multiviewLayout as any) ?? 'pgm+pvw+6';
    const layout = (typeof (window as any) !== 'undefined' ? null : null) || null;
    // MULTIVIEW_LAYOUTS가 상수이므로 import 없이도 동일 값 사용
    // sourceCells 룩업
    const sourceCellsMap: Record<string, number> = {
      'pgm+pvw+4': 4, 'pgm+pvw+6': 6, 'pgm+pvw+8': 8, 'pgm+pvw+10': 10,
      'pgm+pvw+12': 12, 'pgm+pvw+14': 14,
      '2x2': 0, '3x3': 7, '4x4': 14, '5x5': 23,
    };
    const srcCells = sourceCellsMap[layoutId] ?? 6;
    const hasPgmPvw = !!(d.multiviewPgmInput || d.multiviewPvwInput);
    const w2 = (d.width ?? 200) - 20;
    // PGM/PVW 한 줄 (2칸 big)
    if (hasPgmPvw) h += Math.round(w2 / 2 * 9 / 16) + 6;
    // 소스 셀 그리드
    if (srcCells > 0) {
      const cols = srcCells <= 4 ? 2 : srcCells <= 9 ? 3 : srcCells <= 16 ? 4 : 5;
      const rows = Math.ceil(srcCells / cols);
      const cellH = Math.round(w2 / cols * 9 / 16);
      h += rows * (cellH + 2) + 4;
    }
    h += 14; // label + padding
  }
  return h;
}

// 일반 장비용 포트 Y
function portYFromRenderIdx(d: Device, renderIdx: number) {
  return d.y + HEADER_H + PADDING_Y + renderIdx * PORT_H + PORT_H / 2;
}

// 멀티뷰 셀 컴포넌트
function MultiviewCell({ label, inputPort, srcDev, color, big }: {
  label: string;
  inputPort?: string;
  srcDev: Device | null;
  color: 'emerald' | 'amber' | 'slate';
  big?: boolean;
}) {
  const colorMap = {
    emerald: { border: 'border-emerald-500/60', text: 'text-emerald-300', bg: 'bg-emerald-500/10' },
    amber:   { border: 'border-amber-500/60',   text: 'text-amber-300',   bg: 'bg-amber-500/10' },
    slate:   { border: 'border-slate-500/40',   text: 'text-slate-300',   bg: 'bg-slate-500/5' },
  };
  const c = colorMap[color];
  return (
    <div className={`relative rounded ${big ? 'border-2' : 'border'} ${c.border} ${c.bg} overflow-hidden`}
         style={{ aspectRatio: '16 / 9' }}>
      {srcDev?.imageUrl ? (
        <img src={srcDev.imageUrl} alt={srcDev.name}
             className="w-full h-full object-cover"
             style={{ imageRendering: 'auto' }} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-neutral-600 text-[9px] font-mono">{inputPort ?? '—'}</span>
        </div>
      )}
      {/* 라벨 오버레이 */}
      <div className={`absolute ${big ? 'top-0.5 left-1 text-[10px]' : 'top-0 left-0.5 text-[8px]'} ${c.text} font-mono font-bold px-1 rounded bg-black/70`}>
        {label}
      </div>
      {srcDev && (
        <div className="absolute bottom-0 left-0 right-0 text-[7.5px] text-white font-mono bg-black/60 px-1 truncate">
          {srcDev.name}
        </div>
      )}
    </div>
  );
}

// 패치베이 카드의 base(회전 전) 크기
function patchbayBaseSize(d: Device) {
  const ports = Math.max(d.inputs.length, d.outputs.length, 1);
  const w = ports * PB_JACK_W + 28; // 14px padding 양쪽
  const h = HEADER_H + 12 + PB_JACK_H + PB_ROW_GAP + PB_JACK_H + 12;
  return { w, h };
}

// 회전 고려 bbox
function patchbayBBox(d: Device) {
  const { w, h } = patchbayBaseSize(d);
  const r = d.rotation ?? 0;
  if (r === 90 || r === 270) return { w: h, h: w, baseW: w, baseH: h };
  return { w, h, baseW: w, baseH: h };
}

// 패치베이 전용: 포트 X/Y 계산 (셀 중앙 좌표) - 회전 고려
// dir: 'in' = 상단 행 / 'out' = 하단 행 (회전 전 기준)
function patchbayPortXY(d: Device, dir: 'in' | 'out', portIdx: number) {
  // 회전 전 local 좌표 (카드 내부)
  const localCx = 14 + portIdx * PB_JACK_W + PB_JACK_W / 2;
  const localCyIn = HEADER_H + 14;
  const localCyOut = HEADER_H + 14 + PB_JACK_H + PB_ROW_GAP + PB_JACK_H;
  const lx = localCx;
  const ly = dir === 'in' ? localCyIn : localCyOut;

  const rot = d.rotation ?? 0;
  const { baseW, baseH } = patchbayBBox(d);
  // 회전 변환: 카드 좌상단 기준으로 회전 후 bbox 좌표로 변환
  let fx: number, fy: number;
  if (rot === 0) {
    fx = lx; fy = ly;
  } else if (rot === 90) {
    // (x,y) → (baseH - y, x)
    fx = baseH - ly; fy = lx;
  } else if (rot === 180) {
    fx = baseW - lx; fy = baseH - ly;
  } else {
    // 270: (x,y) → (y, baseW - x)
    fx = ly; fy = baseW - lx;
  }
  return { x: d.x + fx, y: d.y + fy };
}

export default function SignalFlowMap() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(1);

  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [traceId, setTraceId] = useState<string | null>(null);
  const [traceMode, setTraceMode] = useState<TraceMode>('both');
  // 라우터/패치베이 연결선 표시 토글 — 이 Set에 포함된 장비만 라인 표시
  const [inspectHubs, setInspectHubs] = useState<Set<string>>(new Set());
  // 도면에 패치베이 카드/관련 연결선 숨김 토글 — 기본 ON
  const [hidePatchbay, setHidePatchbay] = useState<boolean>(true);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [editingCable, setEditingCable] = useState<Connection | null>(null);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showPatchbayMgr, setShowPatchbayMgr] = useState(false);
  const [showWallboxMgr, setShowWallboxMgr] = useState(false);
  const [showBulkEditor, setShowBulkEditor] = useState(false);
  const [pendingFrom, setPendingFrom] = useState<{ device: string; port: string; connType?: ConnectionType } | null>(null);

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

  // 캔버스 크기 추적 (window resize 대응)
  const [viewport, setViewport] = useState({ w: 1920, h: 1080 });
  // Canvas imperative handle — 드래그/팬 중 React state 없이 직접 redraw
  const connectionCanvasRef = useRef<any>(null);
  // 현재 드래그 중인 ID + 오프셋 (Canvas에 imperative로 전달)
  const dragOffsetRef = useRef<{ ids: Set<string>; worldDx: number; worldDy: number } | null>(null);
  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // 터치/핀치 상태
  const pinchRef = useRef<{
    active: boolean;
    startDist: number;
    startScale: number;
    startMidX: number;
    startMidY: number;
    startOffset: { x: number; y: number };
  }>({ active: false, startDist: 0, startScale: 1, startMidX: 0, startMidY: 0, startOffset: { x: 0, y: 0 } });

  // state mirror
  const stateRef = useRef({ scale, offset, editMode, devices, selectedIds, visibleLayerIds: new Set<string>(), layers });

  // ===== Undo stack =====
  // 편집 모드에서 Cmd/Ctrl+Z로 마지막 동작을 되돌림.
  // 각 항목은 "되돌리는 async 함수"와 사람 읽을 수 있는 라벨.
  type UndoEntry = { label: string; undo: () => Promise<void> };
  const undoStackRef = useRef<UndoEntry[]>([]);
  const UNDO_MAX = 50;
  const [undoLabel, setUndoLabel] = useState<string | null>(null);
  const pushUndo = (label: string, undo: () => Promise<void>) => {
    const stack = undoStackRef.current;
    stack.push({ label, undo });
    if (stack.length > UNDO_MAX) stack.shift();
    setUndoLabel(label);
  };
  const popUndo = async () => {
    const stack = undoStackRef.current;
    const entry = stack.pop();
    if (!entry) return false;
    try {
      await entry.undo();
    } catch (e) {
      console.error('[Undo error]', e);
    }
    setUndoLabel(stack[stack.length - 1]?.label ?? null);
    return true;
  };
  stateRef.current.scale = scale;
  stateRef.current.offset = offset;
  stateRef.current.editMode = editMode;
  stateRef.current.devices = devices;
  stateRef.current.selectedIds = selectedIds;
  stateRef.current.layers = layers;

  // ===== Load data =====
  useEffect(() => {
    (async () => {
      const [devRes, connRes, layerRes, rackRes] = await Promise.all([
        supabase.from('devices').select('*'),
        supabase.from('connections').select('*'),
        supabase.from('layers').select('*'),
        supabase.from('racks').select('*'),
      ]);
      let loadedLayers = (layerRes.data ?? []) as Layer[];
      if (loadedLayers.length === 0) {
        await (supabase as any).from('layers').insert(DEFAULT_LAYERS);
        loadedLayers = DEFAULT_LAYERS;
      }
      setLayers(loadedLayers);
      setRacks((rackRes.data ?? []) as Rack[]);
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
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'racks' }, (p: any) => {
        if (p.eventType === 'INSERT') setRacks(prev => [...prev.filter(r => r.id !== p.new.id), p.new]);
        else if (p.eventType === 'UPDATE') setRacks(prev => prev.map(r => r.id === p.new.id ? p.new : r));
        else if (p.eventType === 'DELETE') setRacks(prev => prev.filter(r => r.id !== p.old.id));
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

  // 허브(패치베이/라우터/스위처) IN → OUT 매핑 (traced 추적에 사용)
  // 스위처: selectedInput이 모든 OUT으로 (다른 IN은 매핑 없음 = 신호 흐르지 않음)
  const hubInternalMap = useMemo(() => {
    const m = new Map<string, string>();
    devices.forEach(d => {
      if (d.role === 'patchbay') {
        const hasAny = Object.keys(d.normals ?? {}).length > 0;
        if (hasAny) {
          Object.entries(d.normals ?? {}).forEach(([inPort, outPort]) => {
            m.set(`${d.id}:${inPort}`, outPort);
          });
        } else {
          // normals가 비어있으면 1:1 기본 매핑 가정 (trace 추적용)
          d.inputs.forEach((inPort, i) => {
            const outPort = d.outputs[i];
            if (outPort) m.set(`${d.id}:${inPort}`, outPort);
          });
        }
      } else if (d.role === 'router') {
        // 라우터: routing 매핑 (OUT → IN) 또는 1:1 기본
        // hubInternalMap은 IN → OUT 방향이므로 routing을 뒤집어 저장
        const routing = d.routing ?? {};
        const reverseMap = new Map<string, string>(); // inPort → outPort
        Object.entries(routing).forEach(([outPort, inPort]) => {
          if (inPort && typeof inPort === 'string') reverseMap.set(inPort, outPort);
        });
        // routing에 없는 IN은 1:1 fallback
        d.inputs.forEach((inPort, i) => {
          const outPort = reverseMap.get(inPort) ?? d.outputs[i] ?? d.outputs[0];
          if (outPort) m.set(`${d.id}:${inPort}`, outPort);
        });
      } else if (d.role === 'switcher') {
        // 스위처: selectedInput이 모든 OUT으로 방송. 없으면 첫 IN을 기본값으로 사용해 trace 끊김 방지
        const selIn = d.selectedInput ?? d.inputs[0];
        if (selIn) {
          d.outputs.forEach(outPort => {
            m.set(`${d.id}:${selIn}`, outPort);
          });
        }
      }
    });
    connections.forEach(c => {
      if (c.from_device === c.to_device && c.is_patch) {
        m.set(`${c.from_device}:${c.to_port}`, c.from_port);
      }
    });
    return m;
  }, [devices, connections]);
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

  // ===== 시그널 시뮬레이션 =====
  // "이 장비의 이 입력 포트에 어떤 소스의 이미지가 도착하는지" 계산
  // source 장비 자신도 자기 imageUrl을 가지고 있다고 본다.
  const signalByOutput = useMemo(() => {
    const out = new Map<string, string>();
    const inSignal = new Map<string, string>();

    devices.forEach(d => {
      if (d.role === 'source' && (d.imageUrl || d.audioUrl)) {
        d.outputs.forEach(p => out.set(`${d.id}:${p}`, d.id));
      }
    });

    const iterations = Math.max(8, devices.length + 2);
    for (let iter = 0; iter < iterations; iter++) {
      let changed = false;

      connections.forEach(c => {
        const fromKey = `${c.from_device}:${c.from_port}`;
        const toKey = `${c.to_device}:${c.to_port}`;
        const src = out.get(fromKey);
        if (src && inSignal.get(toKey) !== src) {
          inSignal.set(toKey, src);
          changed = true;
        }
      });

      devices.forEach(d => {
        if (d.role === 'source') return;
        if (d.role === 'display') return;

        if (d.role === 'switcher') {
          // 스위처: selectedInput 하나의 신호가 모든 OUT으로 방송
          const sel = d.selectedInput;
          if (!sel) return;
          const srcSig = inSignal.get(`${d.id}:${sel}`);
          if (!srcSig) return;
          d.outputs.forEach(p => {
            const k = `${d.id}:${p}`;
            if (out.get(k) !== srcSig) { out.set(k, srcSig); changed = true; }
          });
          return;
        }

        if (d.role === 'router') {
          // 라우터: 각 OUT마다 독립 IN 매핑 (crosspoint)
          // routing: { 'OUT-1': 'IN-3', 'OUT-2': 'IN-5', ... }
          // 매핑 없으면 1:1 기본 (IN-N → OUT-N)
          d.outputs.forEach((outPort, outIdx) => {
            const mappedIn = d.routing?.[outPort] ?? d.inputs[outIdx] ?? d.inputs[0];
            if (!mappedIn) return;
            const srcSig = inSignal.get(`${d.id}:${mappedIn}`);
            if (!srcSig) return;
            const k = `${d.id}:${outPort}`;
            if (out.get(k) !== srcSig) { out.set(k, srcSig); changed = true; }
          });
          return;
        }

        if (d.role === 'splitter') {
          const firstIn = d.inputs[0];
          if (!firstIn) return;
          const srcSig = inSignal.get(`${d.id}:${firstIn}`);
          if (!srcSig) return;
          d.outputs.forEach(p => {
            const k = `${d.id}:${p}`;
            if (out.get(k) !== srcSig) { out.set(k, srcSig); changed = true; }
          });
          return;
        }

        if (d.role === 'patchbay') {
          const patches = new Map<string, string>();
          connections.forEach(c => {
            if (c.from_device === d.id && c.to_device === d.id && c.is_patch) {
              patches.set(c.to_port, c.from_port);
            }
          });
          d.outputs.forEach(outPort => {
            let sourceIn: string | undefined;
            for (const [pIn, pOut] of patches.entries()) {
              if (pOut === outPort) { sourceIn = pIn; break; }
            }
            if (!sourceIn && d.normals) {
              for (const [nIn, nOut] of Object.entries(d.normals)) {
                if (nOut === outPort) { sourceIn = nIn; break; }
              }
            }
            if (!sourceIn) return;
            const srcSig = inSignal.get(`${d.id}:${sourceIn}`);
            if (!srcSig) return;
            const k = `${d.id}:${outPort}`;
            if (out.get(k) !== srcSig) { out.set(k, srcSig); changed = true; }
          });
          return;
        }

        if (d.role === 'wallbox' || d.role === 'connector' || d.role === 'standard') {
          d.outputs.forEach(p => {
            let srcSig = inSignal.get(`${d.id}:${p}`);
            if (!srcSig && d.inputs.length > 0) {
              srcSig = inSignal.get(`${d.id}:${d.inputs[0]}`);
            }
            if (!srcSig) return;
            const k = `${d.id}:${p}`;
            if (out.get(k) !== srcSig) { out.set(k, srcSig); changed = true; }
          });
          return;
        }
      });

      if (!changed) break;
    }

    return { out, inSignal };
  }, [devices, connections]);

  const displaySources = useMemo(() => {
    const m = new Map<string, Device>();
    devices.filter(d => d.role === 'display').forEach(d => {
      for (const inp of d.inputs) {
        const srcId = signalByOutput.inSignal.get(`${d.id}:${inp}`);
        if (srcId) {
          const srcDev = devById.get(srcId);
          if (srcDev) { m.set(d.id, srcDev); break; }
        }
      }
    });
    return m;
  }, [devices, signalByOutput, devById]);

  const traced = useMemo(() => {
    if (!traceId) return { devices: new Set<string>(), connections: new Set<string>(), ports: new Set<string>() };
    const dSet = new Set<string>([traceId]);
    const cSet = new Set<string>();
    const pSet = new Set<string>();

    const startDev = devById.get(traceId);
    if (!startDev) return { devices: dSet, connections: cSet, ports: pSet };

    // 시뮬레이션 맵을 활용한 견고한 경로 추출
    // signalByOutput.inSignal: "devId:inPort" → sourceDeviceId (가장 근원 소스)
    // signalByOutput.out:       "devId:outPort" → sourceDeviceId

    // 디스플레이 → 소스: 각 IN 포트에 전달된 sourceId를 얻고,
    //   그 source에서 display까지 닿는 모든 connection을 수집
    // 소스 → 디스플레이: 이 소스에서 출발하는 모든 down-path

    // 양방향 사용 가능한 BFS — 대상 sourceId 또는 displayId를 지정하고
    // 해당 신호가 거치는 모든 edge를 수집
    const collectPathBetween = (sourceId: string, finalDevId?: string) => {
      // BFS 하류: source OUT 신호가 도달하는 모든 (dev, port) 수집
      const queue: Array<{ devId: string; port: string; isOut: boolean }> = [];
      startDev.role === 'source'; // no-op (avoid lint)

      // 시작: sourceId의 모든 OUT에서 해당 source가 전파
      const srcDev = devById.get(sourceId);
      if (!srcDev) return;
      dSet.add(sourceId);
      srcDev.outputs.forEach(p => {
        if (signalByOutput.out.get(`${sourceId}:${p}`) === sourceId) {
          pSet.add(`${sourceId}:${p}`);
          queue.push({ devId: sourceId, port: p, isOut: true });
        }
      });

      const visited = new Set<string>();
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const key = `${cur.devId}:${cur.port}:${cur.isOut ? 'o' : 'i'}`;
        if (visited.has(key)) continue;
        visited.add(key);

        if (cur.isOut) {
          // OUT 포트 → 연결된 to_device/to_port의 IN으로 전달
          connections.forEach(c => {
            if (c.from_device !== cur.devId || c.from_port !== cur.port) return;
            if (c.from_device === c.to_device && c.is_patch) return;
            // 이 신호가 실제로 여기로 전달되는지 확인
            if (signalByOutput.inSignal.get(`${c.to_device}:${c.to_port}`) !== sourceId) return;
            cSet.add(c.id);
            dSet.add(c.to_device);
            pSet.add(`${c.to_device}:${c.to_port}`);
            queue.push({ devId: c.to_device, port: c.to_port, isOut: false });

            // finalDevId가 지정됐고 이 장비가 맞으면 경로 끝
            if (finalDevId && c.to_device === finalDevId) return;
          });
        } else {
          // IN 포트 → 장비 내부에서 OUT으로 전파
          const dev = devById.get(cur.devId);
          if (!dev) continue;
          // finalDevId 도달이면 이 장비의 OUT은 따라가지 않음 (불필요한 다운스트림 가지 차단)
          if (finalDevId && dev.id === finalDevId) continue;
          dev.outputs.forEach(outP => {
            if (signalByOutput.out.get(`${dev.id}:${outP}`) === sourceId) {
              pSet.add(`${dev.id}:${outP}`);
              queue.push({ devId: dev.id, port: outP, isOut: true });
            }
          });
        }
      }
    };

    if (startDev.role === 'display') {
      // 각 IN으로 들어오는 sourceId를 찾고, source→this display 경로 수집
      startDev.inputs.forEach(p => {
        pSet.add(`${traceId}:${p}`);
        const srcId = signalByOutput.inSignal.get(`${traceId}:${p}`);
        if (srcId) collectPathBetween(srcId, traceId);
      });
    } else if (startDev.role === 'source') {
      // 이 소스가 도달하는 모든 장비 추적
      collectPathBetween(traceId);
    } else {
      // 중간 장비: 이 장비로 들어오는 모든 source 경로 + 이 장비에서 나가는 하류 경로
      startDev.inputs.forEach(p => {
        pSet.add(`${traceId}:${p}`);
        const srcId = signalByOutput.inSignal.get(`${traceId}:${p}`);
        if (srcId) collectPathBetween(srcId, traceId);
      });
      // 이 장비의 OUT에 있는 신호들 → 그 source에서 다시 전체 하류 수집하되 finalDevId 없이
      startDev.outputs.forEach(p => {
        const srcId = signalByOutput.out.get(`${traceId}:${p}`);
        if (srcId) collectPathBetween(srcId);
      });
    }

    if (typeof console !== 'undefined') {
      console.log('[Trace]', startDev.name, startDev.role, 'dev:', dSet.size, 'conn:', cSet.size, 'port:', pSet.size);
    }

    return { devices: dSet, connections: cSet, ports: pSet };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceId, connections, visibleLayerIds, devices, signalByOutput]);


  // ===== 성능 최적화: connection 인덱스 =====
  // O(1)로 "이 OUT 포트가 어디로 가는지" 조회
  const connByFromPort = useMemo(() => {
    const m = new Map<string, Connection>();  // key: "deviceId:portName"
    connections.forEach(c => {
      if (c.from_device === c.to_device && c.is_patch) return;
      m.set(`${c.from_device}:${c.from_port}`, c);
    });
    return m;
  }, [connections]);

  const connByToPort = useMemo(() => {
    const m = new Map<string, Connection>();
    connections.forEach(c => {
      if (c.from_device === c.to_device && c.is_patch) return;
      m.set(`${c.to_device}:${c.to_port}`, c);
    });
    return m;
  }, [connections]);

  // 장비별 hub 연결 목록 (배지 바용) — IN 쪽만
  const hubConnsByDevice = useMemo(() => {
    const m = new Map<string, Array<{ id: string; hub: Device; myPort: string; hubPort: string }>>();
    connections.forEach(c => {
      if (c.from_device === c.to_device && c.is_patch) return;
      const hub = devById.get(c.from_device);
      if (!hub || (hub.role !== 'router' && hub.role !== 'patchbay')) return;
      const me = devById.get(c.to_device);
      if (!me || me.role === 'router' || me.role === 'patchbay') return;
      const arr = m.get(me.id) ?? [];
      arr.push({ id: c.id, hub, myPort: c.to_port, hubPort: c.from_port });
      m.set(me.id, arr);
    });
    return m;
  }, [connections, devById]);

  // 장비별 OUT 포트의 destination 정보
  const destInfoByOutPort = useMemo(() => {
    const m = new Map<string, { destDev: Device; destConn: Connection }>();
    connections.forEach(c => {
      if (c.from_device === c.to_device && c.is_patch) return;
      const destDev = devById.get(c.to_device);
      if (!destDev) return;
      m.set(`${c.from_device}:${c.from_port}`, { destDev, destConn: c });
    });
    return m;
  }, [connections, devById]);

  // 장비별 visiblePorts 결과 캐시 — 매 렌더마다 여러 번 호출되므로 O(1) lookup
  const visiblePortsCache = useMemo(() => {
    const m = new Map<string, { in: ReturnType<typeof visiblePorts>; out: ReturnType<typeof visiblePorts> }>();
    devices.forEach(d => {
      m.set(d.id, {
        in: visiblePorts(d, 'in', visibleLayerIds),
        out: visiblePorts(d, 'out', visibleLayerIds),
      });
    });
    return m;
  }, [devices, visibleLayerIds]);

  // ===== Canvas 렌더링용 cable data (정적) =====
  // dragOffset은 의존성에서 제외 — 드래그 중엔 이 memo 재계산 안 됨. Canvas 안에서 offset 적용.
  const canvasCables = useMemo(() => {
    const list: Array<{
      fromId: string; toId: string;  // 드래그 offset 적용용
      x1: number; y1: number; x2: number; y2: number;
      color: string; strokeWidth: number;
      isTraced: boolean; isPatch: boolean; isPgm: boolean;
      dashArray?: number[];
    }> = [];

    connections.forEach(c => {
      if (!isConnVisible(c)) return;
      if (c.from_device === c.to_device && c.is_patch) return;
      if (traceId && !traced.connections.has(c.id)) return;
      const from = devById.get(c.from_device);
      const to = devById.get(c.to_device);
      if (!from || !to) return;

      const fromIsHub = from.role === 'router' || from.role === 'patchbay';
      const toIsHub = to.role === 'router' || to.role === 'patchbay';
      if (hidePatchbay && (fromIsHub || toIsHub)) return;
      const hubConn = fromIsHub || toIsHub;
      if (hubConn) {
        const inspectedHere =
          (fromIsHub && inspectHubs.has(from.id)) ||
          (toIsHub && inspectHubs.has(to.id));
        const tracedHere = traceId && traced.connections.has(c.id);
        if (!inspectedHere && !tracedHere) return;
      }

      const outVis = visiblePortsCache.get(from.id)?.out ?? [];
      const inVis = visiblePortsCache.get(to.id)?.in ?? [];
      const fi = outVis.findIndex(p => p.name === c.from_port);
      const ti = inVis.findIndex(p => p.name === c.to_port);
      if (fi < 0 || ti < 0) return;

      const x1 = from.x + deviceWidth(from);
      const y1 = portYFromRenderIdx(from, fi);
      const x2 = to.x;
      const y2 = portYFromRenderIdx(to, ti);

      const fromLayerId = from.outputsMeta?.[c.from_port]?.layerId;
      const layerColor = fromLayerId ? layerById.get(fromLayerId)?.color : undefined;
      const baseColor = layerColor ?? (from.type === 'audio' ? TYPE_COLORS.audio.main : from.type === 'combined' ? TYPE_COLORS.combined.main : TYPE_COLORS.video.main);
      const isPgm = from.role === 'switcher' && from.pgmPort === c.from_port;
      const isPatch = c.is_patch === true;
      const isTraced = traced.connections.has(c.id);
      const color = isPatch ? '#F97316' : baseColor;

      list.push({
        fromId: from.id, toId: to.id,
        x1, y1, x2, y2, color,
        strokeWidth: isPgm ? 2.2 : isPatch ? 2 : 1.4,
        isTraced, isPatch, isPgm,
        dashArray: isPatch ? [5, 4] : undefined,
      });
    });

    return list;
    // dragOffset/viewport/offset/scale 제외 — 드래그/팬 중 재계산 안 되게
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections, devices, traced, hidePatchbay, inspectHubs, visiblePortsCache, traceId, layerById]);

  // 허브(패치베이/라우터) IN → OUT 매핑
  // 패치베이: normals(IN→OUT) + 수동 패치(OUT,IN)
  // 라우터: selectedInput이 모든 OUT으로 → 하지만 도면 조망을 위해 "어떤 IN으로 들어오면 어떤 OUT으로 나가는지" 전부 수집
  //   - 실제로는 라우터는 selectedInput만 통과하지만, 도면 추적 목적으론 모든 IN→모든 OUT 매핑 가능하다고 표시
  //   - 대신 라우터는 IN ↔ 실제 외부 연결된 OUT들을 일대일로 매핑: "첫 OUT에 매핑된 외부 장비"가 가장 의미있음
  //   - 단순화: 라우터의 각 IN은 "같은 index의 OUT으로" (1:1) 가정 — 실제 정상 연결은 selectedInput으로 결정됨
  // OUT 포트에서 시작해 "패치베이를 투명하게 통과"한 뒤의 최종 도착점 추적
  // 결과: 체인(경유 노드 목록) + 최종 도착 Device/Connection
  //   예) Switcher OUT → Patchbay#1 IN-05 →(normal) OUT-05 → MAIN PGM IN-1
  //   → chain: [{hub: Patchbay#1, inPort: 'IN-05', outPort: 'OUT-05'}]
  //     finalDev: MAIN PGM, finalPort: 'SDI-1'
  type PatchHop = { hub: Device; inPort: string; outPort: string };
  type FollowedPath = { chain: PatchHop[]; finalDev: Device; finalPort: string } | null;

  const followPathFromOut = useMemo(() => {
    const cache = new Map<string, FollowedPath>(); // "deviceId:portName" → result

    // 재귀적으로 체인 수집 (최대 깊이 8)
    const follow = (fromDevId: string, fromPort: string, depth: number, seen: Set<string>): FollowedPath => {
      const key = `${fromDevId}:${fromPort}`;
      if (depth > 8) return null;
      if (seen.has(key)) return null;
      const nextSeen = new Set(seen);
      nextSeen.add(key);

      const info = destInfoByOutPort.get(key);
      if (!info) return null;
      const { destDev, destConn } = info;

      // 허브(패치베이/라우터)가 아니면 여기가 최종 도착점
      if (destDev.role !== 'patchbay' && destDev.role !== 'router') {
        return { chain: [], finalDev: destDev, finalPort: destConn.to_port };
      }

      // 허브면 IN → OUT 내부 매핑으로 따라감
      const inPort = destConn.to_port;
      const outPort = hubInternalMap.get(`${destDev.id}:${inPort}`);
      if (!outPort) return null;

      const sub = follow(destDev.id, outPort, depth + 1, nextSeen);
      if (!sub) return null;
      return {
        chain: [{ hub: destDev, inPort, outPort }, ...sub.chain],
        finalDev: sub.finalDev,
        finalPort: sub.finalPort,
      };
    };

    return (deviceId: string, portName: string): FollowedPath => {
      const key = `${deviceId}:${portName}`;
      if (cache.has(key)) return cache.get(key)!;
      const result = follow(deviceId, portName, 0, new Set());
      cache.set(key, result);
      return result;
    };
  }, [destInfoByOutPort, hubInternalMap]);

  // IN 포트 기준 역추적 — 이 IN으로 신호 보내는 "원래 source 장비 OUT"을 찾아 동일한 패치베이 코드를 반환
  // destDev의 IN 포트 p로 들어오는 신호가 어느 장비의 OUT에서 출발했는지 찾음
  // followPathFromOut으로 모든 OUT → finalDev 매핑이 있으니, 역으로 index
  const followPathByFinalIn = useMemo(() => {
    const m = new Map<string, { chain: PatchHop[]; sourceDev: Device; sourcePort: string }>();
    devices.forEach(src => {
      if (src.role === 'patchbay' || src.role === 'router') return;
      src.outputs.forEach(port => {
        const followed = followPathFromOut(src.id, port);
        if (!followed || followed.chain.length === 0) return;
        if (followed.finalDev.role === 'patchbay' || followed.finalDev.role === 'router') return;
        const key = `${followed.finalDev.id}:${followed.finalPort}`;
        m.set(key, { chain: followed.chain, sourceDev: src, sourcePort: port });
      });
    });
    return m;
  }, [devices, followPathFromOut]);

  // ===== Global window listeners =====
  useEffect(() => {
    // 키보드: Cmd/Ctrl+Z — 편집모드 undo
    const onKey = async (e: KeyboardEvent) => {
      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z' || e.key === 'ㅋ');
      if (!isUndo) return;
      // 편집모드 아니면 무시
      if (!stateRef.current.editMode) return;
      // 입력 포커스 중이면 기본 undo에 맡김
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      e.preventDefault();
      await popUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // rAF 스로틀 — 연속 이벤트를 프레임당 한 번씩만 처리
    let rafId: number | null = null;
    let pendingEvent: { clientX: number; clientY: number } | null = null;

    const processMove = () => {
      rafId = null;
      if (!pendingEvent) return;
      const e = pendingEvent;
      pendingEvent = null;

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
          // DOM 직접 조작 — React setState 우회해서 드래그 중 성능 극대화
          Object.keys(origs).forEach(id => {
            const orig = origs[id];
            const el = document.querySelector(`[data-device-id="${id}"]`) as HTMLElement | null;
            if (el) {
              const newX = orig.x + worldDx;
              const newY = orig.y + worldDy;
              el.style.left = `${newX}px`;
              el.style.top = `${newY}px`;
            }
          });
          // Canvas에 드래그 오프셋 전달 — React state 없이 imperative redraw
          const newDragOffset = { ids: new Set(Object.keys(origs)), worldDx, worldDy };
          dragOffsetRef.current = newDragOffset;
          connectionCanvasRef.current?.updateDragOffset(newDragOffset);
        }
      } else if (p.type === 'marquee' && p.worldStartX !== undefined && p.worldStartY !== undefined) {
        const sc = stateRef.current.scale;
        const offs = stateRef.current.offset;
        const wx = (e.clientX - offs.x) / sc;
        const wy = (e.clientY - offs.y) / sc;
        const x = Math.min(p.worldStartX, wx);
        const y = Math.min(p.worldStartY, wy);
        const w = Math.abs(wx - p.worldStartX);
        const h = Math.abs(wy - p.worldStartY);
        setMarqueeRect({ x, y, w, h });
        if (!p.moved && (w > DRAG_THRESHOLD || h > DRAG_THRESHOLD)) p.moved = true;
      }
    };

    const onMove = (e: MouseEvent) => {
      const p = pointerRef.current;
      if (p.type === 'none') return;
      pendingEvent = { clientX: e.clientX, clientY: e.clientY };
      if (rafId == null) rafId = requestAnimationFrame(processMove);
    };

    const onUp = async () => {
      const p = pointerRef.current;
      if (p.type === 'none') return;

      if (p.type === 'device') {
        if (p.moved) {
          // DOM-direct 드래그 종료: 최종 위치를 state에 한 번에 반영
          const origs = p.origPositions;
          const ids = p.dragIds ?? [];
          let finalPositions: Record<string, {x:number;y:number}> = {};
          if (origs) {
            // 현재 DOM에서 위치 읽어 commit
            ids.forEach(id => {
              const el = document.querySelector(`[data-device-id="${id}"]`) as HTMLElement | null;
              if (el) {
                finalPositions[id] = {
                  x: parseFloat(el.style.left) || origs[id]?.x || 0,
                  y: parseFloat(el.style.top) || origs[id]?.y || 0,
                };
              }
            });
            // React state 업데이트 (최종 1회)
            setDevices(prev => prev.map(dev =>
              finalPositions[dev.id] ? { ...dev, ...finalPositions[dev.id] } : dev
            ));
          }
          dragOffsetRef.current = null;
          connectionCanvasRef.current?.updateDragOffset(null);
          // DB 저장
          const saves = Object.entries(finalPositions).map(([id, pos]) =>
            (supabase as any).from('devices').update({ x: pos.x, y: pos.y }).eq('id', id)
          );
          await Promise.all(saves);
          // Undo 등록
          if (origs) {
            const snapshot = { ...origs };
            pushUndo(
              ids.length === 1 ? '이동 되돌리기' : `${ids.length}개 이동 되돌리기`,
              async () => {
                setDevices(prev => prev.map(d => snapshot[d.id] ? { ...d, ...snapshot[d.id] } : d));
                await Promise.all(Object.entries(snapshot).map(([id, pos]) =>
                  (supabase as any).from('devices').update({ x: pos.x, y: pos.y }).eq('id', id)
                ));
              }
            );
          }
        } else {
          // 클릭으로 판정
          const clickedId = p.clickedDeviceId!;
          const clickedDev = stateRef.current.devices.find(x => x.id === clickedId);
          if (clickedDev) {
            if (stateRef.current.editMode) {
              // 그룹에 속한 경우 동일 그룹의 모든 장비 id 수집
              const groupMates = clickedDev.groupId
                ? stateRef.current.devices.filter(x => x.groupId === clickedDev.groupId).map(x => x.id)
                : [clickedId];
              if (p.shiftKey) {
                setSelectedIds(prev => {
                  const next = new Set(prev);
                  const allIn = groupMates.every(id => next.has(id));
                  if (allIn) groupMates.forEach(id => next.delete(id));
                  else groupMates.forEach(id => next.add(id));
                  return next;
                });
              } else {
                setSelectedIds(new Set(groupMates));
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
      } else if (p.type === 'canvas' && !p.moved) {
        // 빈 공간 탭 (드래그 안 함) → 보기 모드면 trace 해제
        if (!stateRef.current.editMode) setTraceId(null);
      }

      pointerRef.current = { type: 'none', downX: 0, downY: 0, shiftKey: false, moved: false };
      setDraggingCursor('none');
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    // 터치 이벤트: 핀치가 아닐 때(단일 터치)만 mouse로 매핑하여 팬/드래그/마키 동작
    const onTouchMove = (e: TouchEvent) => {
      if (pinchRef.current.active) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      // 캔버스 또는 장비 위 팬/드래그 중이면 기본 스크롤 방지
      if (pointerRef.current.type !== 'none') e.preventDefault();
      onMove({ clientX: t.clientX, clientY: t.clientY } as unknown as MouseEvent);
    };
    const onTouchEnd = (_e: TouchEvent) => {
      if (pinchRef.current.active) return;
      onUp();
    };
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
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

  // ===== 터치/핀치 핸들러 (캔버스 레벨) =====
  const onCanvasTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    // UI/버튼/오디오 위는 무시
    if (target.closest('[data-ui], [data-port], [data-device-id], input, textarea, select, audio, video, button')) return;
    if (e.touches.length === 2) {
      // 핀치 시작
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      pinchRef.current = {
        active: true,
        startDist: dist,
        startScale: scale,
        startMidX: midX, startMidY: midY,
        startOffset: { ...offset },
      };
    } else if (e.touches.length === 1) {
      // 한 손가락 팬 - canvas mousedown처럼 처리 (synthesized MouseEvent로 재활용하지 않고 직접)
      const t = e.touches[0];
      pointerRef.current = {
        type: 'canvas',
        downX: t.clientX, downY: t.clientY,
        shiftKey: false, moved: false,
        origOffset: { ...offset },
      };
      setDraggingCursor('canvas');
      if (editMode) setSelectedIds(new Set());
    }
  };

  const onCanvasTouchMove = (e: React.TouchEvent) => {
    if (pinchRef.current.active && e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const factor = dist / pinchRef.current.startDist;
      const newScale = Math.min(2, Math.max(0.15, pinchRef.current.startScale * factor));

      // 핀치 중심점을 기준으로 zoom
      const mx0 = pinchRef.current.startMidX - rect.left;
      const my0 = pinchRef.current.startMidY - rect.top;
      const wx = (mx0 - pinchRef.current.startOffset.x) / pinchRef.current.startScale;
      const wy = (my0 - pinchRef.current.startOffset.y) / pinchRef.current.startScale;

      // + 두 손가락 팬(중심점 이동)도 반영
      const panDx = midX - pinchRef.current.startMidX;
      const panDy = midY - pinchRef.current.startMidY;
      const mx = mx0 + panDx;
      const my = my0 + panDy;

      setScale(newScale);
      setOffset({ x: mx - wx * newScale, y: my - wy * newScale });
      return;
    }
    // 단일 터치 팬은 window-level move가 처리함 (Touch → Mouse 에뮬레이션)
  };

  const onCanvasTouchEnd = () => {
    if (pinchRef.current.active) {
      pinchRef.current.active = false;
    }
  };

  // ===== Device mousedown =====
  const onDeviceMouseDown = (e: React.MouseEvent, d: Device) => {
    // audio/video/input 등의 UI 컨트롤이면 장비 드래그 시작하지 않음
    const tgt = e.target as HTMLElement;
    if (tgt.closest('[data-ui]') || ['AUDIO', 'VIDEO', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(tgt.tagName)) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    if (!editMode) {
      // 보기 모드 — 장비 click으로 trace (onClick 사용)
      return;
    }

    // 편집 모드: 드래그 후보로 등록
    const isInSelection = selectedIds.has(d.id);

    // 드래그 대상 결정:
    // 1) 이미 선택에 포함되면 선택 전체
    // 2) 선택에 없다면 이 장비(+ 같은 그룹 메이트)
    let idsToMove: string[];
    if (isInSelection && selectedIds.size > 0) {
      idsToMove = Array.from(selectedIds);
    } else if (d.groupId) {
      idsToMove = devices.filter(x => x.groupId === d.groupId).map(x => x.id);
    } else {
      idsToMove = [d.id];
    }

    // 그룹 메이트까지 포함되도록 확장
    const allGroupIds = new Set(idsToMove);
    idsToMove.forEach(id => {
      const dev = devById.get(id);
      if (dev?.groupId) {
        devices.filter(x => x.groupId === dev.groupId).forEach(gm => allGroupIds.add(gm.id));
      }
    });
    idsToMove = Array.from(allGroupIds);

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
    setTraceId(t => {
      // 동일 장비 다시 클릭 → 트레이스 해제
      if (t === d.id) return null;
      // 소스 → 하향(다운스트림)만, 디스플레이 → 상향(업스트림)만 자동 설정
      if (d.role === 'source') setTraceMode('downstream');
      else if (d.role === 'display') setTraceMode('upstream');
      else setTraceMode('both');
      return d.id;
    });
  };

  // ===== 보기 모드 퀵 액션 =====
  // 스위처: PGM 포트 설정 (OUT 중 하나)
  const setSwitcherPgm = async (deviceId: string, port: string) => {
    const d = devById.get(deviceId);
    if (!d) return;
    const prev = d.pgmPort;
    const next = prev === port ? null : port; // 동일 토글이면 해제
    setDevices(prevDs => prevDs.map(x => x.id === deviceId ? { ...x, pgmPort: next ?? undefined } : x));
    await (supabase as any).from('devices').update({ pgmPort: next }).eq('id', deviceId);
    pushUndo(`"${d.name}" PGM 되돌리기`, async () => {
      setDevices(ps => ps.map(x => x.id === deviceId ? { ...x, pgmPort: prev } : x));
      await (supabase as any).from('devices').update({ pgmPort: prev ?? null }).eq('id', deviceId);
    });
  };

  // 스위처/디스플레이: selectedInput 변경
  const setSelectedInput = async (deviceId: string, inputPort: string) => {
    const d = devById.get(deviceId);
    if (!d) return;
    const prev = d.selectedInput;
    if (prev === inputPort) return;
    setDevices(prevDs => prevDs.map(x => x.id === deviceId ? { ...x, selectedInput: inputPort } : x));
    await (supabase as any).from('devices').update({ selectedInput: inputPort }).eq('id', deviceId);
    pushUndo(`"${d.name}" 입력 되돌리기`, async () => {
      setDevices(ps => ps.map(x => x.id === deviceId ? { ...x, selectedInput: prev } : x));
      await (supabase as any).from('devices').update({ selectedInput: prev ?? null }).eq('id', deviceId);
    });
  };

  // 라우터: OUT 포트를 다음 IN으로 순차 변경 (crosspoint cycling)
  const cycleRouterOutput = async (deviceId: string, outPort: string) => {
    const d = devById.get(deviceId);
    if (!d || d.role !== 'router') return;
    const currentIn = d.routing?.[outPort] ?? d.inputs[d.outputs.indexOf(outPort)] ?? d.inputs[0];
    const idx = d.inputs.indexOf(currentIn);
    const nextIn = d.inputs[(idx + 1) % d.inputs.length];
    if (!nextIn) return;
    const newRouting = { ...(d.routing ?? {}), [outPort]: nextIn };
    const prev = d.routing;
    setDevices(prevDs => prevDs.map(x => x.id === deviceId ? { ...x, routing: newRouting } : x));
    await (supabase as any).from('devices').update({ routing: newRouting }).eq('id', deviceId);
    pushUndo(`"${d.name}" 라우팅 되돌리기`, async () => {
      setDevices(ps => ps.map(x => x.id === deviceId ? { ...x, routing: prev } : x));
      await (supabase as any).from('devices').update({ routing: prev ?? null }).eq('id', deviceId);
    });
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
      // 덮어쓸 기존 연결 스냅샷
      const overwritten = connections.find(c => c.to_device === deviceId && c.to_port === port);
      await (supabase as any).from('connections').delete().eq('to_device', deviceId).eq('to_port', port);
      await (supabase as any).from('connections').insert(newConn);
      pushUndo('케이블 연결 되돌리기', async () => {
        await (supabase as any).from('connections').delete().eq('id', newConn.id);
        if (overwritten) {
          await (supabase as any).from('connections').insert(overwritten);
        }
      });
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
    pushUndo('장비 추가 되돌리기', async () => {
      await (supabase as any).from('connections').delete().or(`from_device.eq.${id},to_device.eq.${id}`);
      await (supabase as any).from('devices').delete().eq('id', id);
    });
    setEditingDevice(d);
  };

  // 멀티뷰 장비 추가 — 기본 IN 8채널(PGM, PVW + 6 소스)
  const handleAddMultiview = async () => {
    const id = `mv_${Date.now().toString(36)}`;
    const defaultLayer = layers[0]?.id ?? 'layer_video';
    const inputs = ['PGM', 'PVW', ...Array.from({ length: 6 }, (_, i) => `SRC-${i + 1}`)];
    const inputsMeta: Record<string, any> = {};
    inputs.forEach(p => { inputsMeta[p] = { name: p, layerId: defaultLayer }; });
    const d: Device = {
      id, name: '멀티뷰', type: 'video', role: 'multiview',
      x: (-offset.x + 400) / scale, y: (-offset.y + 200) / scale,
      width: 340,
      inputs, outputs: [],
      inputsMeta, outputsMeta: {},
      multiviewLayout: 'pgm+pvw+6' as any,
      multiviewPgmInput: 'PGM',
      multiviewPvwInput: 'PVW',
      physPorts: {}, routing: {},
    };
    await (supabase as any).from('devices').insert(d);
    pushUndo('멀티뷰 추가 되돌리기', async () => {
      await (supabase as any).from('connections').delete().or(`from_device.eq.${id},to_device.eq.${id}`);
      await (supabase as any).from('devices').delete().eq('id', id);
    });
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
      // 그룹은 승계하지 않음 (복제본은 독립)
      groupId: undefined,
      groupName: undefined,
      // 연결은 복제 안함
      inputs: [...src.inputs],
      outputs: [...src.outputs],
      inputsMeta: src.inputsMeta ? JSON.parse(JSON.stringify(src.inputsMeta)) : {},
      outputsMeta: src.outputsMeta ? JSON.parse(JSON.stringify(src.outputsMeta)) : {},
      physPorts: { ...src.physPorts },
      routing: { ...src.routing },
      normals: src.normals ? { ...src.normals } : undefined,
    };
    await (supabase as any).from('devices').insert(clone);
    pushUndo('복제 되돌리기', async () => {
      await (supabase as any).from('connections').delete().or(`from_device.eq.${id},to_device.eq.${id}`);
      await (supabase as any).from('devices').delete().eq('id', id);
    });
    setEditingDevice(clone);
  };

  const handleSaveDevice = async (updates: Partial<Device>) => {
    if (!editingDevice) return;
    const targetId = editingDevice.id;
    // 변경 전 원본 스냅샷 (undo용)
    const before = { ...editingDevice };

    const cleanUpdates: Record<string, any> = {};
    Object.entries(updates).forEach(([k, v]) => {
      if (v !== undefined) cleanUpdates[k] = v;
    });

    setDevices(prev => prev.map(d => d.id === targetId ? { ...d, ...updates } : d));
    setEditingDevice(null);

    // 스마트 저장: 컬럼 누락 에러가 뜨면 해당 컬럼을 자동 제거하고 재시도 (최대 10회)
    const trySave = async (payload: Record<string, any>, removed: string[] = []): Promise<{ ok: boolean; removed: string[]; err?: any }> => {
      if (removed.length > 10) return { ok: false, removed, err: new Error('너무 많은 컬럼 누락') };
      const { error } = await (supabase as any).from('devices').update(payload).eq('id', targetId);
      if (!error) return { ok: true, removed };
      // PostgREST 에러 메시지에서 누락된 컬럼명 추출
      // 예: "Could not find the 'audioStoragePath' column of 'devices'"
      const msg = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`;
      const match = msg.match(/['"]([A-Za-z_][A-Za-z0-9_]*)['"].*column/i) || msg.match(/column\s+['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/i);
      if (match && match[1] && payload[match[1]] !== undefined) {
        const col = match[1];
        const next = { ...payload };
        delete next[col];
        return trySave(next, [...removed, col]);
      }
      return { ok: false, removed, err: error };
    };

    const result = await trySave(cleanUpdates);

    if (!result.ok) {
      console.error('[DB save error]', result.err);
      alert(`저장 실패: ${result.err?.message ?? JSON.stringify(result.err)}\n\nSupabase SQL Editor에서 schema.sql을 실행해 누락된 컬럼을 추가해주세요.`);
      return;
    }

    if (result.removed.length > 0) {
      console.warn('[DB] 누락된 컬럼 자동 제거:', result.removed);
      alert(`⚠️  일부 컬럼이 DB에 없어 건너뛰었습니다: ${result.removed.join(', ')}\nSupabase SQL Editor에서 schema.sql을 실행하면 다음부터 저장됩니다.`);
    }

    // 성공 시 undo 등록
    pushUndo(`"${before.name}" 편집 되돌리기`, async () => {
      // 전체 필드를 원래대로 복구
      setDevices(prev => prev.map(d => d.id === targetId ? before : d));
      await (supabase as any).from('devices').update(before).eq('id', targetId);
    });
  };
  const handleDeleteDevice = async () => {
    if (!editingDevice) return;
    const snapshot = { ...editingDevice };
    const relatedConns = connections.filter(c => c.from_device === snapshot.id || c.to_device === snapshot.id);
    await (supabase as any).from('connections').delete().or(`from_device.eq.${snapshot.id},to_device.eq.${snapshot.id}`);
    await (supabase as any).from('devices').delete().eq('id', snapshot.id);
    pushUndo(`"${snapshot.name}" 삭제 되돌리기`, async () => {
      await (supabase as any).from('devices').insert(snapshot);
      if (relatedConns.length > 0) {
        await (supabase as any).from('connections').insert(relatedConns);
      }
    });
    setEditingDevice(null);
  };
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}개 장비 삭제?`)) return;
    const ids = Array.from(selectedIds);
    const snapshotDevs = ids.map(id => devices.find(d => d.id === id)).filter(Boolean) as Device[];
    const snapshotConns = connections.filter(c =>
      ids.includes(c.from_device) || ids.includes(c.to_device)
    );
    for (const id of ids) {
      await (supabase as any).from('connections').delete().or(`from_device.eq.${id},to_device.eq.${id}`);
      await (supabase as any).from('devices').delete().eq('id', id);
    }
    setSelectedIds(new Set());
    pushUndo(`${ids.length}개 삭제 되돌리기`, async () => {
      if (snapshotDevs.length > 0) await (supabase as any).from('devices').insert(snapshotDevs);
      if (snapshotConns.length > 0) await (supabase as any).from('connections').insert(snapshotConns);
    });
  };

  // ========== 그룹화 ==========
  const handleGroupSelected = async () => {
    if (selectedIds.size < 2) return;
    const ids = Array.from(selectedIds);
    const sel = ids.map(id => devices.find(d => d.id === id)).filter(Boolean) as Device[];
    // 이전 상태 기록 (undo)
    const prevState = sel.map(d => ({ id: d.id, groupId: d.groupId, groupName: d.groupName }));
    const existingGroup = sel.find(d => d.groupName)?.groupName ?? '';
    const name = prompt('그룹 이름을 입력하세요:', existingGroup || 'Group 1');
    if (!name) return;
    const groupId = `grp_${Date.now().toString(36)}`;
    setDevices(prev => prev.map(d =>
      ids.includes(d.id) ? { ...d, groupId, groupName: name.trim() } : d
    ));
    const updates = ids.map(id =>
      (supabase as any).from('devices').update({ groupId, groupName: name.trim() }).eq('id', id)
    );
    await Promise.all(updates);
    pushUndo(`그룹화 되돌리기`, async () => {
      setDevices(prev => prev.map(d => {
        const ps = prevState.find(x => x.id === d.id);
        return ps ? { ...d, groupId: ps.groupId, groupName: ps.groupName } : d;
      }));
      await Promise.all(prevState.map(ps =>
        (supabase as any).from('devices').update({
          groupId: ps.groupId ?? null, groupName: ps.groupName ?? null,
        }).eq('id', ps.id)
      ));
    });
  };

  const handleUngroupSelected = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const sel = ids.map(id => devices.find(d => d.id === id)).filter(Boolean) as Device[];
    const prevState = sel.map(d => ({ id: d.id, groupId: d.groupId, groupName: d.groupName }));
    setDevices(prev => prev.map(d =>
      ids.includes(d.id) ? { ...d, groupId: undefined, groupName: undefined } : d
    ));
    const updates = ids.map(id =>
      (supabase as any).from('devices').update({ groupId: null, groupName: null }).eq('id', id)
    );
    await Promise.all(updates);
    pushUndo(`그룹 해제 되돌리기`, async () => {
      setDevices(prev => prev.map(d => {
        const ps = prevState.find(x => x.id === d.id);
        return ps ? { ...d, groupId: ps.groupId, groupName: ps.groupName } : d;
      }));
      await Promise.all(prevState.map(ps =>
        (supabase as any).from('devices').update({
          groupId: ps.groupId ?? null, groupName: ps.groupName ?? null,
        }).eq('id', ps.id)
      ));
    });
  };

  // 선택된 장비가 속한 그룹 이름 (모두 같은 그룹일 때만)
  const selectedGroupInfo = (() => {
    if (selectedIds.size === 0) return null;
    const sel = Array.from(selectedIds).map(id => devices.find(d => d.id === id)).filter(Boolean) as Device[];
    const grpIds = new Set(sel.map(d => d.groupId).filter(Boolean));
    if (grpIds.size === 1 && sel.every(d => d.groupId)) {
      return { id: Array.from(grpIds)[0], name: sel[0].groupName ?? '(이름없음)', count: sel.length };
    }
    return null;
  })();

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

    // Undo 등록
    const prevPositions = new Map<string, { x: number; y: number }>();
    sel.forEach(d => prevPositions.set(d.id, { x: d.x, y: d.y }));
    pushUndo(`정렬 되돌리기`, async () => {
      setDevices(prev => prev.map(d => {
        const pos = prevPositions.get(d.id);
        return pos ? { ...d, x: pos.x, y: pos.y } : d;
      }));
      await Promise.all(Array.from(prevPositions.entries()).map(([id, pos]) =>
        (supabase as any).from('devices').update({ x: pos.x, y: pos.y }).eq('id', id)
      ));
    });
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
    // undo 스택 비우기
    undoStackRef.current = [];
    setUndoLabel(null);
  };

  // 드래그 중엔 body에 class를 붙여 CSS 애니메이션 일시정지 (성능)
  // loading 체크 이전에 두어야 Hook 순서 일관 유지
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const b = document.body;
    if (draggingCursor !== 'none') b.classList.add('is-dragging');
    else b.classList.remove('is-dragging');
  }, [draggingCursor]);

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
      <div data-ui className="absolute top-0 left-0 right-0 z-30 h-12 md:h-14 bg-black/80 border-b border-white/10 shadow-xl shadow-black/40">
        <div className="h-full flex items-center gap-1.5 md:gap-2 px-2 md:px-3 overflow-x-auto overflow-y-hidden scrollbar-thin flex-nowrap toolbar" style={{ scrollbarWidth: 'thin' }}>
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            <div className="relative w-6 h-6 md:w-7 md:h-7 rounded-lg bg-gradient-to-br from-sky-400 to-purple-600 flex items-center justify-center shadow-lg shadow-sky-500/30">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="3" cy="3" r="1.5" fill="white"/>
                <circle cx="13" cy="3" r="1.5" fill="white"/>
                <circle cx="3" cy="13" r="1.5" fill="white"/>
                <circle cx="13" cy="13" r="1.5" fill="white"/>
                <path d="M3 3 L13 13 M13 3 L3 13" stroke="white" strokeWidth="0.8" opacity="0.6"/>
              </svg>
            </div>
            <div className="hidden lg:block">
              <div className="text-[12px] font-bold tracking-tight leading-tight">Signal Flow Map</div>
              <div className="text-[10px] text-neutral-500 leading-tight font-mono">경남이스포츠 · UHD</div>
            </div>
          </div>

          <div className="w-px h-6 bg-white/10 shrink-0"></div>

          <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5 border border-white/10 shrink-0">
            <button
              onClick={() => { setEditMode(false); setPendingFrom(null); setSelectedIds(new Set()); }}
              className={`px-2 md:px-2.5 py-1 md:py-1.5 text-[11px] font-medium rounded-md whitespace-nowrap ${!editMode ? 'bg-gradient-to-r from-neutral-700 to-neutral-600 text-white shadow-md' : 'text-neutral-400 hover:text-white'}`}
              title="보기 모드"
            >👁<span className="hidden sm:inline ml-1">보기</span></button>
            <button
              onClick={() => { setEditMode(true); setTraceId(null); }}
              className={`px-2 md:px-2.5 py-1 md:py-1.5 text-[11px] font-medium rounded-md whitespace-nowrap ${editMode ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30' : 'text-neutral-400 hover:text-white'}`}
              title="편집 모드"
            >✎<span className="hidden sm:inline ml-1">편집</span></button>
          </div>

          <button
            onClick={() => setShowLayerPanel(s => !s)}
            className={`px-2 md:px-2.5 py-1 md:py-1.5 text-[11px] font-medium rounded-lg border whitespace-nowrap shrink-0 ${showLayerPanel ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white border-purple-400 shadow-md shadow-purple-500/30' : 'bg-white/5 border-white/10 text-neutral-300 hover:text-white hover:bg-white/10'}`}
            title="레이어 관리"
          >⧉<span className="hidden sm:inline ml-1">레이어</span> <span className="font-mono opacity-70">{layers.filter(l => l.visible).length}/{layers.length}</span></button>

          <button
            onClick={() => setShowPatchbayMgr(true)}
            className="px-2 md:px-2.5 py-1 md:py-1.5 text-[11px] font-medium rounded-lg border bg-white/5 border-teal-500/30 text-teal-300 hover:text-white hover:bg-teal-500/20 whitespace-nowrap shrink-0"
            title="패치베이 관리"
          >⊟<span className="hidden sm:inline ml-1">패치베이</span> <span className="font-mono opacity-70">{devices.filter(d => d.role === 'patchbay').length}</span></button>

          {devices.some(d => d.role === 'patchbay' || d.role === 'router') && (
            <button
              onClick={() => setHidePatchbay(v => !v)}
              className={`px-2 md:px-2.5 py-1 md:py-1.5 text-[11px] font-medium rounded-lg border flex items-center gap-1 whitespace-nowrap shrink-0 ${
                hidePatchbay
                  ? 'bg-teal-500 border-teal-400 text-white shadow-md shadow-teal-500/30'
                  : 'bg-white/5 border-white/15 text-neutral-400 hover:bg-teal-500/20 hover:text-teal-200 hover:border-teal-500/40'
              }`}
              title={hidePatchbay ? '허브가 숨겨짐 — 클릭하면 표시' : '허브 표시중 — 클릭하면 숨김'}
            >
              <span className="font-mono">{hidePatchbay ? '⊘' : '⊟'}</span>
              <span className="hidden sm:inline">허브{hidePatchbay ? ' 숨김' : ''}</span>
            </button>
          )}

          <button
            onClick={() => setShowWallboxMgr(true)}
            className="px-2 md:px-2.5 py-1 md:py-1.5 text-[11px] font-medium rounded-lg border bg-white/5 border-amber-500/30 text-amber-300 hover:text-white hover:bg-amber-500/20 whitespace-nowrap shrink-0"
            title="월박스 관리"
          >▦<span className="hidden sm:inline ml-1">월박스</span> <span className="font-mono opacity-70">{devices.filter(d => d.role === 'wallbox').length}</span></button>

          {/* 라우터/패치베이 선 전체 보기 토글 */}
          {(() => {
            const allHubs = devices.filter(d => d.role === 'router' || d.role === 'patchbay');
            if (allHubs.length === 0) return null;
            const activeCount = allHubs.filter(h => inspectHubs.has(h.id)).length;
            const allOn = activeCount === allHubs.length;
            const someOn = activeCount > 0 && !allOn;
            return (
              <button
                onClick={() => {
                  if (allOn) setInspectHubs(new Set());
                  else setInspectHubs(new Set(allHubs.map(h => h.id)));
                }}
                className={`px-2 md:px-2.5 py-1 md:py-1.5 text-[11px] font-medium rounded-lg border flex items-center gap-1 whitespace-nowrap shrink-0 ${
                  allOn
                    ? 'bg-fuchsia-500 border-fuchsia-400 text-white shadow-md shadow-fuchsia-500/40'
                    : someOn
                      ? 'bg-fuchsia-500/30 border-fuchsia-500/50 text-fuchsia-100'
                      : 'bg-white/5 border-white/15 text-neutral-400 hover:bg-fuchsia-500/20 hover:text-fuchsia-200 hover:border-fuchsia-500/40'
                }`}
                title={`허브 연결선: ${allOn ? '전체 표시' : someOn ? `${activeCount}/${allHubs.length}` : '숨김'}`}
              >
                <span className="font-mono text-[13px]">👁</span>
                <span className="hidden md:inline">Hub선</span>
                <span className="text-[10px]">{allOn ? 'ON' : someOn ? `${activeCount}/${allHubs.length}` : 'OFF'}</span>
              </button>
            );
          })()}

          {(() => {
            const activeSources = devices.filter(d => d.role === 'source' && (d.imageUrl || d.audioUrl)).length;
            const liveDisplays = Array.from(displaySources.values()).length;
            if (activeSources === 0 && devices.filter(d => d.role === 'display').length === 0) return null;
            return (
              <div
                className="flex items-center gap-1.5 px-2 py-1 md:py-1.5 rounded-lg bg-gradient-to-r from-lime-500/10 to-sky-500/10 border border-lime-500/25 whitespace-nowrap shrink-0"
                title="신호 시뮬레이션 활성"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse shadow-md shadow-lime-400/60"></div>
                <span className="text-[11px] font-medium">
                  <span className="text-lime-300 font-mono">▶{activeSources}</span>
                  <span className="text-neutral-500 mx-0.5">→</span>
                  <span className="text-sky-300 font-mono">🖵{liveDisplays}</span>
                </span>
              </div>
            );
          })()}

          {!editMode && traceId && (
            <>
              <div className="flex items-center gap-0.5 bg-sky-500/10 border border-sky-500/30 rounded-lg p-0.5 shrink-0">
                {(['both','upstream','downstream'] as TraceMode[]).map(m => (
                  <button key={m} onClick={() => setTraceMode(m)}
                    className={`px-2 py-1 text-[11px] font-medium rounded-md ${traceMode === m ? 'bg-sky-500 text-white' : 'text-sky-300 hover:text-white'}`}
                    title={m === 'both' ? '양방향' : m === 'upstream' ? '상류' : '하류'}
                  >{m === 'both' ? '↔' : m === 'upstream' ? '⬅' : '➡'}</button>
                ))}
              </div>
              <button
                onClick={() => setTraceId(null)}
                className="px-2 py-1 md:py-1.5 text-[11px] font-medium rounded-lg border bg-red-500/15 border-red-500/40 text-red-300 hover:bg-red-500 hover:text-white flex items-center gap-1 whitespace-nowrap shrink-0"
                title="신호 추적 해제"
              >
                <span>✕</span>
                <span className="hidden sm:inline">추적 해제</span>
              </button>
            </>
          )}

          {editMode && (
            <>
              <button onClick={handleAddDevice}
                className="px-2 md:px-2.5 py-1 md:py-1.5 text-[11px] font-medium rounded-lg bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white shadow-md shadow-sky-500/30 whitespace-nowrap shrink-0" title="장비 추가">＋<span className="hidden sm:inline ml-1">장비</span></button>
              <button onClick={handleAddMultiview}
                className="px-2 md:px-2.5 py-1 md:py-1.5 text-[11px] font-medium rounded-lg bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-400 hover:to-violet-500 text-white shadow-md shadow-violet-500/30 whitespace-nowrap shrink-0" title="멀티뷰 추가">▦<span className="hidden sm:inline ml-1">멀티뷰</span></button>
              {selectedIds.size > 0 && (
                <>
                  <div className="px-2.5 py-1 text-[11px] rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-medium">
                    {selectedIds.size}개 선택
                    {selectedGroupInfo && (
                      <span className="ml-1.5 text-[10px] px-1 rounded bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/30 font-mono">
                        ⬢ {selectedGroupInfo.name}
                      </span>
                    )}
                  </div>

                  {/* 일괄편집 */}
                  <button
                    onClick={() => setShowBulkEditor(true)}
                    className="px-2.5 py-1 text-[11px] rounded-lg bg-purple-500/15 hover:bg-purple-500 text-purple-200 hover:text-white border border-purple-500/30 hover:border-purple-400 font-medium transition"
                    title="선택된 장비에 공통 필드 일괄 적용"
                  >✎ 일괄편집</button>

                  {/* 그룹화/해제 */}
                  {selectedIds.size >= 2 && !selectedGroupInfo && (
                    <button
                      onClick={handleGroupSelected}
                      className="px-2.5 py-1 text-[11px] rounded-lg bg-fuchsia-500/15 hover:bg-fuchsia-500 text-fuchsia-200 hover:text-white border border-fuchsia-500/30 hover:border-fuchsia-400 font-medium transition"
                      title="선택된 장비를 하나의 그룹으로 묶기"
                    >⬢ 그룹화</button>
                  )}
                  {selectedGroupInfo && (
                    <>
                      <button
                        onClick={handleGroupSelected}
                        className="px-2.5 py-1 text-[11px] rounded-lg bg-fuchsia-500/10 hover:bg-fuchsia-500/30 text-fuchsia-300 border border-fuchsia-500/30 font-medium transition"
                        title="그룹 이름 변경"
                      >✎ 이름</button>
                      <button
                        onClick={handleUngroupSelected}
                        className="px-2.5 py-1 text-[11px] rounded-lg bg-white/5 hover:bg-rose-500/60 text-neutral-400 hover:text-white border border-white/10 transition"
                        title="그룹 해제"
                      >⬡ 해제</button>
                    </>
                  )}

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
              {undoLabel && (
                <button
                  onClick={() => popUndo()}
                  className="px-2.5 py-1.5 text-[11px] rounded-lg bg-indigo-500/15 hover:bg-indigo-500 text-indigo-300 hover:text-white border border-indigo-500/30 hover:border-indigo-400 font-medium transition flex items-center gap-1.5"
                  title="Ctrl+Z 로 되돌리기"
                >
                  <span className="font-mono text-[13px]">↶</span>
                  <span className="truncate max-w-40">{undoLabel}</span>
                  <span className="text-[9px] text-indigo-400/70 font-mono">⌘Z</span>
                </button>
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
        <div className="text-[10.5px] uppercase tracking-[0.12em] text-neutral-500 font-semibold mb-1.5">타입</div>
        <div className="space-y-1 text-[11.5px]">
          <div className="flex items-center gap-2"><div className="w-3 h-2.5 rounded-sm bg-gradient-to-r from-sky-400 to-sky-600 shadow-sm shadow-sky-500/50"></div> <span className="text-neutral-300">Video</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-2.5 rounded-sm bg-gradient-to-r from-rose-400 to-rose-600 shadow-sm shadow-rose-500/50"></div> <span className="text-neutral-300">Audio</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-2.5 rounded-sm bg-gradient-to-r from-purple-400 to-purple-600 shadow-sm shadow-purple-500/50"></div> <span className="text-neutral-300">V + A</span></div>
        </div>
        {editMode && (
          <div className="mt-2.5 pt-2 border-t border-white/10 text-[10.5px] text-neutral-500 space-y-0.5">
            <div><kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-400 font-mono text-[9px]">클릭</kbd> 편집</div>
            <div><kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-400 font-mono text-[9px]">Shift</kbd> 다중선택</div>
            <div><kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-400 font-mono text-[9px]">Shift+드래그</kbd> 박스</div>
            <div><kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-400 font-mono text-[9px]">케이블 클릭</kbd> tie-line/patch</div>
          </div>
        )}
      </div>

      {/* Canvas */}
      <div
        className={`absolute inset-0 pt-12 md:pt-14 ${cursorClass}`}
        onMouseDown={onCanvasMouseDown}
        onWheel={onWheel}
        onTouchStart={onCanvasTouchStart}
        onTouchMove={onCanvasTouchMove}
        onTouchEnd={onCanvasTouchEnd}
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: `${24 * scale}px ${24 * scale}px`,
          backgroundPosition: `${offset.x}px ${offset.y}px`,
          touchAction: 'none',                        // 브라우저 기본 팬/줌 차단 → 우리가 처리
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        {/* Connection Canvas — screen space에 그려 DOM scale 영향 없음 */}
        <div className="absolute inset-x-0 bottom-0 top-12 md:top-14 overflow-hidden pointer-events-none">
          <ConnectionCanvas
            ref={connectionCanvasRef}
            width={viewport.w}
            height={viewport.h - (viewport.w >= 768 ? 56 : 48)}
            scale={scale}
            offsetX={offset.x}
            offsetY={offset.y}
            cables={canvasCables}
          />
        </div>

        <div style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: '0 0', width: '4000px', height: '3000px', position: 'relative' }}>
          {/* Connections */}
          <svg width="4000" height="3000" className="absolute inset-0" style={{ overflow: 'visible', pointerEvents: 'none' }}>
            <defs>
              <filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              <filter id="glow-strong" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>

            {/* 그룹 경계 박스 (연결선보다 뒤에) — trace 중엔 추적 장비만 포함 */}
            {(() => {
              const groups = new Map<string, { name: string; devs: Device[] }>();
              devices.forEach(d => {
                if (!d.groupId || !isDeviceVisible(d)) return;
                // trace 중이면 추적에 포함된 장비만 그룹 boundary에 반영
                if (traceId && !traced.devices.has(d.id)) return;
                // 허브 숨김 모드에선 허브 제외
                if (hidePatchbay && (d.role === 'patchbay' || d.role === 'router')) return;
                const g = groups.get(d.groupId);
                if (g) g.devs.push(d);
                else groups.set(d.groupId, { name: d.groupName ?? '그룹', devs: [d] });
              });
              const PAD = 18;
              return Array.from(groups.entries()).map(([gid, { name, devs }]) => {
                if (devs.length === 0) return null;
                const minX = Math.min(...devs.map(d => d.x)) - PAD;
                const minY = Math.min(...devs.map(d => d.y)) - PAD - 18;
                const maxX = Math.max(...devs.map(d => d.x + deviceWidth(d))) + PAD;
                const maxY = Math.max(...devs.map(d => d.y + deviceHeight(d, visibleLayerIds))) + PAD;
                const w = maxX - minX, h = maxY - minY;
                return (
                  <g key={gid}>
                    <rect
                      x={minX} y={minY} width={w} height={h}
                      fill="rgba(217,70,239,0.04)"
                      stroke="rgba(217,70,239,0.38)"
                      strokeWidth="1.2"
                      strokeDasharray="8 5"
                      rx="10"
                    />
                    {/* 그룹 라벨 탭 */}
                    <rect
                      x={minX + 8} y={minY - 2} width={Math.min(160, 6 + name.length * 7.5)} height="18"
                      rx="4"
                      fill="rgba(217,70,239,0.25)"
                      stroke="rgba(217,70,239,0.55)"
                      strokeWidth="0.8"
                    />
                    <text
                      x={minX + 15} y={minY + 10}
                      fontSize="10.5"
                      fill="#F5D0FE"
                      fontWeight="700"
                      fontFamily="var(--font-sans)"
                      dominantBaseline="middle"
                    >⬢ {name} · {devs.length}</text>
                  </g>
                );
              });
            })()}

            {editMode && connections.map(c => {
              if (!isConnVisible(c)) return null;
              if (c.from_device === c.to_device && c.is_patch) return null;
              // Trace 중이면 traced가 아닌 연결은 즉시 컷 — 렌더 작업 절약
              if (traceId && !traced.connections.has(c.id)) return null;
              const from = devById.get(c.from_device)!;
              const to = devById.get(c.to_device)!;
              const fromIsHub = from.role === 'router' || from.role === 'patchbay';
              const toIsHub = to.role === 'router' || to.role === 'patchbay';
              if (hidePatchbay && (fromIsHub || toIsHub)) return null;
              const hubConn = fromIsHub || toIsHub;
              if (hubConn) {
                const inspectedHere =
                  (fromIsHub && inspectHubs.has(from.id)) ||
                  (toIsHub && inspectHubs.has(to.id));
                const tracedHere = traceId && traced.connections.has(c.id);
                if (!inspectedHere && !tracedHere) return null;
              }
              const outVis = visiblePortsCache.get(from.id)?.out ?? [];
              const inVis = visiblePortsCache.get(to.id)?.in ?? [];
              const fi = outVis.findIndex(p => p.name === c.from_port);
              const ti = inVis.findIndex(p => p.name === c.to_port);
              if (fi < 0 || ti < 0) return null;

              // 모든 장비(패치베이 포함) 일반 카드 규칙 사용: OUT은 오른쪽 중앙, IN은 왼쪽 중앙
              const x1 = from.x + deviceWidth(from);
              const y1 = portYFromRenderIdx(from, fi);
              const x2 = to.x;
              const y2 = portYFromRenderIdx(to, ti);

              // 경로 계산: 일반 수평 베지어
              const dxAbs = Math.abs(x2 - x1);
              const dyAbs = Math.abs(y2 - y1);
              const ctrl = Math.max(80, dxAbs / 1.8, dyAbs / 2.5);
              const path = `M ${x1} ${y1} C ${x1 + ctrl} ${y1}, ${x2 - ctrl} ${y2}, ${x2} ${y2}`;
              const isTraced = traced.connections.has(c.id);
              const isDim = false;
              const ct = c.conn_type ?? from.outputsMeta?.[c.from_port]?.connType;
              const style = ct ? CONN_TYPE_STYLES[ct] : undefined;
              const fromLayerId = from.outputsMeta?.[c.from_port]?.layerId;
              const layerColor = fromLayerId ? layerById.get(fromLayerId)?.color : undefined;
              const color = layerColor ?? (from.type === 'audio' ? TYPE_COLORS.audio.main : from.type === 'combined' ? TYPE_COLORS.combined.main : TYPE_COLORS.video.main);
              const isPgm = from.role === 'switcher' && from.pgmPort === c.from_port;
              const isPatch = c.is_patch === true;
              // 이 케이블에 실제 신호(source)가 흐르는지
              const liveSrcId = signalByOutput.out.get(`${c.from_device}:${c.from_port}`);
              const isLive = !!liveSrcId;
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;

              // 패치 케이블은 주황색, live는 색 더 선명
              const cableColor = isPatch ? '#F97316' : color;
              const cableDash = isPatch ? '5 4' : (style?.dash ?? undefined);

              return (
                <g key={c.id} opacity={isDim ? 0.1 : 1} style={{ pointerEvents: 'none' }}>
                  {/* Trace 중에만 glow 레이어 — 평상시엔 생략해 성능 확보 */}
                  {/* Trace 중에만 glow 레이어 */}
                  {isTraced && (
                    <path d={path} stroke={cableColor} strokeWidth={6} fill="none"
                          opacity={0.3} />
                  )}
                  {/* 베이스 라인 */}
                  <path d={path} stroke={cableColor} strokeWidth={isTraced ? 3 : isPgm ? 2.2 : isPatch ? 2 : 1.4}
                        strokeDasharray={cableDash} fill="none"
                        opacity={isTraced ? 1 : isPgm || isPatch ? 0.85 : 0.55} />
                  {/* 흐름 애니메이션 오버레이 — trace 중에만 */}
                  {isTraced && (
                    <path
                      d={path}
                      stroke={cableColor}
                      strokeWidth={2.5}
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray="6 12"
                      className="flow-line"
                      style={{ animationDuration: '1.2s' }}
                    />
                  )}
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

            {/* hidePatchbay 모드: 라벨-to-라벨 가상 케이블 */}
            {/* Trace 중이면 trace 경로에 해당하는 vc만, 아니면 전체 */}
            {hidePatchbay && (() => {
              const LABEL_WIDTH = 130;
              const LABEL_H_OFFSET = 8;
              const LABEL_PAD = 6;

              type VirtualCable = {
                id: string;
                fromDev: Device; fromPortIdx: number;
                toDev: Device; toPortIdx: number;
                code: string;
                color: string;
                isTraced: boolean;
              };
              const vcs: VirtualCable[] = [];

              devices.forEach(d => {
                if (d.role === 'patchbay' || d.role === 'router') return;
                if (!isDeviceVisible(d)) return;
                const cache = visiblePortsCache.get(d.id);
                if (!cache) return;
                cache.out.forEach((p, idx) => {
                  const followed = followPathFromOut(d.id, p.name);
                  if (!followed || followed.chain.length === 0) return;
                  if (followed.finalDev.role === 'patchbay' || followed.finalDev.role === 'router') return;
                  const destCache = visiblePortsCache.get(followed.finalDev.id);
                  if (!destCache) return;
                  const toIdx = destCache.in.findIndex(x => x.name === followed.finalPort);
                  if (toIdx < 0) return;

                  // trace 모드면 이 경로가 trace 체인에 포함되는지 확인
                  const isVcTraced = !!traceId
                    && traced.ports.has(`${d.id}:${p.name}`)
                    && traced.ports.has(`${followed.finalDev.id}:${followed.finalPort}`);
                  // trace 중인데 이 경로가 포함 안 되면 건너뜀
                  if (traceId && !isVcTraced) return;

                  const firstHop = followed.chain[0];
                  const isRtHop = firstHop.hub.role === 'router';
                  const hubList = devices.filter(x => x.role === firstHop.hub.role);
                  const hubIdx = hubList.findIndex(x => x.id === firstHop.hub.id) + 1;
                  const portNum = firstHop.hub.inputs.indexOf(firstHop.inPort) + 1;
                  const prefix = isRtHop ? 'R' : 'P';
                  const code = `${prefix}${String(hubIdx).padStart(2, '0')}-${String(portNum).padStart(2, '0')}`;
                  const lid = d.outputsMeta?.[p.name]?.layerId;
                  const layerColor = lid ? layerById.get(lid)?.color : undefined;
                  const clr = layerColor ?? (d.type === 'audio' ? TYPE_COLORS.audio.main : d.type === 'combined' ? TYPE_COLORS.combined.main : TYPE_COLORS.video.main);
                  vcs.push({
                    id: `vc_${d.id}_${p.name}`,
                    fromDev: d, fromPortIdx: idx,
                    toDev: followed.finalDev, toPortIdx: toIdx,
                    code, color: clr, isTraced: isVcTraced,
                  });
                });
              });

              return (
                <g style={{ pointerEvents: 'none' }}>
                  {vcs.map(vc => {
                    const fromW = deviceWidth(vc.fromDev);
                    // OUT 라벨 박스 오른쪽 끝점
                    const x1 = vc.fromDev.x + fromW + 6 + LABEL_WIDTH + LABEL_PAD;
                    const y1 = vc.fromDev.y + HEADER_H + PADDING_Y + vc.fromPortIdx * PORT_H + PORT_H / 2;
                    // IN 라벨 박스 왼쪽 끝점
                    const x2 = vc.toDev.x - 6 - LABEL_WIDTH - LABEL_PAD;
                    const y2 = vc.toDev.y + HEADER_H + PADDING_Y + vc.toPortIdx * PORT_H + PORT_H / 2;

                    const dxAbs = Math.abs(x2 - x1);
                    const dyAbs = Math.abs(y2 - y1);
                    const ctrl = Math.max(80, dxAbs / 1.8, dyAbs / 2.5);
                    const path = `M ${x1} ${y1} C ${x1 + ctrl} ${y1}, ${x2 - ctrl} ${y2}, ${x2} ${y2}`;

                    const liveSrc = signalByOutput.out.get(`${vc.fromDev.id}:${vc.fromDev.outputs[vc.fromPortIdx]}`);
                    const isLive = !!liveSrc;

                    return (
                      <g key={vc.id}>
                        {vc.isTraced && (
                          <path d={path} stroke={vc.color} strokeWidth={7} fill="none"
                                opacity={0.4} filter="url(#glow-strong)" />
                        )}
                        <path d={path}
                              stroke={vc.color}
                              strokeWidth={vc.isTraced ? 2.8 : 1.6}
                              strokeDasharray={vc.isTraced ? "6 12" : "2 4"}
                              fill="none"
                              opacity={vc.isTraced ? 1 : 0.5}
                              filter={vc.isTraced ? 'url(#glow)' : undefined}
                              className={vc.isTraced ? "flow-line" : ""}
                              style={vc.isTraced ? { animationDuration: '1.2s' } : undefined}
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })()}

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
            if (hidePatchbay && (d.role === 'patchbay' || d.role === 'router')) return null;
            if (traceId && !traced.devices.has(d.id)) return null;
            // 뷰포트 컬링 — 화면 밖 장비 skip
            const w = deviceWidth(d);
            const h = deviceHeight(d, visibleLayerIds);
            const viewWorldLeft = (-offset.x - 200) / scale;
            const viewWorldTop = (-offset.y - 200) / scale;
            const viewWorldRight = (viewport.w - offset.x + 200) / scale;
            const viewWorldBottom = (viewport.h - offset.y + 200) / scale;
            if (d.x + w < viewWorldLeft || d.x > viewWorldRight) return null;
            if (d.y + h < viewWorldTop || d.y > viewWorldBottom) return null;

            const color = TYPE_COLORS[d.type];
            const isSelected = selectedIds.has(d.id);
            const isTraceTarget = traceId === d.id;
            const isTraced = traced.devices.has(d.id);
            const isDim = false;
            const vpCached = visiblePortsCache.get(d.id);
            const inVis = vpCached?.in ?? [];
            const outVis = vpCached?.out ?? [];
            const role = d.role ?? 'standard';
            const roleIcon =
              role === 'switcher' ? '⇆'
              : role === 'router' ? '⇅'
              : role === 'splitter' ? '⇶'
              : role === 'patchbay' ? '⊟'
              : role === 'wallbox' ? '▦'
              : role === 'source' ? '▶'
              : role === 'display' ? '🖵'
              : role === 'multiview' ? '▦'
              : role === 'connector' ? '━'
              : null;
            const isPatchbay = role === 'patchbay';
            const isWallbox = role === 'wallbox';
            const isSource = role === 'source';
            const isDisplay = role === 'display';
            const isMultiview = role === 'multiview';
            const currentDisplaySource = isDisplay ? displaySources.get(d.id) : undefined;

            // 이 장비의 IN 포트에 연결된 hub (precomputed)
            const hubConnections = hubConnsByDevice.get(d.id) ?? [];
            // 패치베이 내 포트 번호(1부터 시작) 구하기
            const hubPortIndex = (hub: Device, portName: string, isOutputSide: boolean): number => {
              const list = isOutputSide ? hub.outputs : hub.inputs;
              const idx = list.indexOf(portName);
              return idx >= 0 ? idx + 1 : 0;
            };

            const borderColor = isSelected ? '#fbbf24' : isTraceTarget ? color.glow : editMode ? 'rgba(251,191,36,0.35)' : color.border;
            const borderWidth = isSelected || isTraceTarget ? 2 : 1.2;

            return (
              <div key={d.id} style={{ display: 'contents' }}>
              <div
                data-device-id={d.id}
                onMouseDown={e => onDeviceMouseDown(e, d)}
                onTouchStart={e => {
                  if (e.touches.length !== 1) return;
                  const t = e.touches[0];
                  // 동일 로직을 React.MouseEvent shape으로 합성
                  onDeviceMouseDown({
                    target: e.target,
                    clientX: t.clientX, clientY: t.clientY,
                    shiftKey: false,
                    stopPropagation: () => e.stopPropagation(),
                    preventDefault: () => e.preventDefault(),
                  } as unknown as React.MouseEvent, d);
                }}
                onClick={e => onDeviceClickView(e, d)}
                className={`absolute rounded-xl overflow-hidden ${isSelected ? 'device-selected' : ''}`}
                style={(() => {
                  const useBaseW = w;
                  const useBaseH = h;
                  const finalTransform = '';

                  const isRouterRole = role === 'router';

                  return {
                    left: d.x, top: d.y,
                    width: useBaseW, minHeight: useBaseH,
                    background: isPatchbay ? 'rgba(10,14,14,0.95)'
                      : isWallbox ? 'rgba(14,12,8,0.95)'
                      : isRouterRole ? 'rgba(14,10,6,0.95)'
                      : 'rgba(8,8,10,0.95)',
                    border: `${borderWidth}px solid ${
                      isPatchbay && !isSelected && !isTraceTarget ? 'rgba(20,184,166,0.4)'
                      : isWallbox && !isSelected && !isTraceTarget ? 'rgba(245,158,11,0.4)'
                      : isRouterRole && !isSelected && !isTraceTarget ? 'rgba(249,115,22,0.5)'
                      : borderColor
                    }`,
                    boxShadow: isSelected
                      ? `0 0 0 2px rgba(251,191,36,0.6)`
                      : isTraceTarget
                      ? `0 0 0 2px ${color.glow}aa`
                      : `0 2px 8px rgba(0,0,0,0.4)`,
                    cursor: editMode ? 'move' : 'pointer',
                    transform: finalTransform || undefined,
                    transformOrigin: '0 0',
                  };
                })()}
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
                      <div className="text-[14px] font-semibold truncate text-white leading-snug tracking-tight">{d.name}</div>
                      {roleIcon && (
                        <span
                          className="text-[9px] px-1 py-[1px] rounded shrink-0 font-mono font-bold"
                          style={{
                            background:
                              isWallbox ? 'rgba(245,158,11,0.15)'
                              : isPatchbay ? 'rgba(20,184,166,0.15)'
                              : role === 'router' ? 'rgba(249,115,22,0.18)'
                              : isMultiview ? 'rgba(139,92,246,0.18)'
                              : isSource ? 'rgba(132,204,22,0.2)'
                              : isDisplay ? 'rgba(14,165,233,0.18)'
                              : role === 'connector' ? 'rgba(148,163,184,0.15)'
                              : 'rgba(16,185,129,0.15)',
                            color:
                              isWallbox ? '#FBBF24'
                              : isPatchbay ? '#2DD4BF'
                              : role === 'router' ? '#FB923C'
                              : isMultiview ? '#A78BFA'
                              : isSource ? '#A3E635'
                              : isDisplay ? '#38BDF8'
                              : role === 'connector' ? '#CBD5E1'
                              : '#34D399',
                            border: `0.5px solid ${
                              isWallbox ? 'rgba(251,191,36,0.4)'
                              : isPatchbay ? 'rgba(45,212,191,0.4)'
                              : role === 'router' ? 'rgba(251,146,60,0.45)'
                              : isMultiview ? 'rgba(167,139,250,0.45)'
                              : isSource ? 'rgba(163,230,53,0.4)'
                              : isDisplay ? 'rgba(56,189,248,0.4)'
                              : role === 'connector' ? 'rgba(203,213,225,0.3)'
                              : 'rgba(52,211,153,0.4)'
                            }`,
                          }}
                          title={DEVICE_ROLE_LABELS[role]}
                        >{roleIcon} {DEVICE_ROLE_LABELS[role]}</span>
                      )}
                      {/* 라우터/패치베이: 연결선 표시 토글 */}
                      {(role === 'router' || role === 'patchbay') && (
                        <button
                          data-ui
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectHubs(prev => {
                              const next = new Set(prev);
                              if (next.has(d.id)) next.delete(d.id);
                              else next.add(d.id);
                              return next;
                            });
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          className={`text-[9px] px-1.5 py-[1px] rounded shrink-0 font-mono font-bold transition ${
                            inspectHubs.has(d.id)
                              ? 'bg-sky-500 text-white shadow-md shadow-sky-500/40 border border-sky-400'
                              : 'bg-white/5 text-neutral-400 border border-white/15 hover:bg-sky-500/20 hover:text-sky-200 hover:border-sky-500/40'
                          }`}
                          title={inspectHubs.has(d.id) ? '연결선 숨기기' : '연결선 확인'}
                        >
                          {inspectHubs.has(d.id) ? '👁 ON' : '👁'}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0 mt-1">
                      <span className="text-[9px] text-neutral-500 uppercase tracking-[0.1em] font-medium shrink-0">{d.type}</span>
                      {d.model && (
                        <>
                          <span className="text-neutral-700 text-[8px]">·</span>
                          <span className="text-[10.5px] font-mono text-neutral-400/90 truncate" title={d.model}>
                            {d.model}
                          </span>
                        </>
                      )}
                      {isWallbox && d.location && (
                        <>
                          <span className="text-neutral-700 text-[8px]">·</span>
                          <span className="text-[10.5px] text-amber-300/90 truncate font-medium" title={`${d.location}${d.roomNumber ? ' · ' + d.roomNumber : ''}`}>
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

                {/* Ports — 패치베이도 일반 카드 형태로 통일 (관리 모드에서만 실사) */}
                <div className="relative" style={{ paddingTop: PADDING_Y, paddingBottom: PADDING_Y, minHeight: Math.max(inVis.length, outVis.length) * PORT_H }}>
                  {/* 패치베이 전용: 도면 카드 우상단 관리 버튼 */}
                  {isPatchbay && editMode && (
                    <button
                      data-ui
                      onClick={e => { e.stopPropagation(); setShowPatchbayMgr(true); }}
                      onMouseDown={e => e.stopPropagation()}
                      className="absolute text-[9px] px-1.5 py-0.5 rounded bg-teal-500/20 hover:bg-teal-500 text-teal-300 hover:text-white border border-teal-500/40 font-medium transition"
                      style={{ top: 4, right: 4, zIndex: 10 }}
                      title="패치베이 관리 페이지 열기"
                    >⊟ 관리</button>
                  )}
                  <div className="flex">
                    {/* IN 컬럼 (왼쪽 절반) */}
                    <div className="flex-1 min-w-0">
                    {inVis.map((p, renderIdx) => {
                      const meta = d.inputsMeta?.[p.name];
                      const ct = meta?.connType;
                      const ctStyle = ct ? CONN_TYPE_STYLES[ct] : undefined;
                      const lid = meta?.layerId;
                      const layer = lid ? layerById.get(lid) : undefined;
                      const portColor = layer?.color ?? color.main;
                      const isSel = d.selectedInput === p.name;
                      // 보기 모드에서 스위처/라우터/디스플레이의 IN을 클릭해 활성 입력 변경
                      // 보기 모드에서 스위처/디스플레이의 IN을 클릭해 활성 입력 변경
                      // 라우터는 선택이 아니라 크로스포인트 — IN 클릭으로는 아무 일도 안 일어남
                      const canSelect = !editMode && (d.role === 'switcher' || d.role === 'display');
                      return (
                        <div
                          key={p.name}
                          className={`flex items-center ${canSelect ? 'cursor-pointer hover:bg-cyan-500/10 rounded' : ''} ${isSel && canSelect ? 'bg-cyan-500/15' : ''}`}
                          style={{ height: PORT_H }}
                          onClick={canSelect ? (e) => { e.stopPropagation(); setSelectedInput(d.id, p.name); } : undefined}
                          title={canSelect ? `클릭하여 활성 입력으로 선택` : undefined}
                        >
                          <button
                            data-port
                            onMouseDown={onPortMouseDown}
                            onClick={e => onPortClick(e, d.id, p.name, false)}
                            className={`w-3 h-3 rounded-full -ml-[6px] hover:scale-[1.6] transition-transform ring-2 shrink-0 ${isSel && canSelect ? 'ring-cyan-300/70' : 'ring-black/40'}`}
                            style={{ background: isSel && canSelect ? '#22d3ee' : portColor, boxShadow: `0 0 ${isSel && canSelect ? '12px' : '8px'} ${isSel && canSelect ? '#22d3ee' : portColor}, inset 0 1px 1px rgba(255,255,255,0.3)` }}
                            title={meta?.label ?? p.name}
                          ></button>
                          <div className="ml-2 flex-1 flex items-center gap-1.5 min-w-0">
                            {isSel && canSelect && (
                              <span className="text-[9.5px] px-1.5 py-[2px] rounded font-mono font-bold shrink-0"
                                style={{ background: 'linear-gradient(90deg, #0891b2, #06b6d4)', color: 'white', boxShadow: '0 0 8px rgba(34,211,238,0.6)' }}>
                                ● ON
                              </span>
                            )}
                            <span className="text-[11.5px] text-neutral-200 font-mono truncate font-medium">{p.name}</span>
                            {ct && (
                              <span className="text-[9.5px] px-1.5 py-[2px] rounded font-mono font-semibold shrink-0"
                                style={{ background: `${portColor}20`, color: portColor, border: `0.5px solid ${portColor}55`, boxShadow: `0 0 4px ${portColor}30` }}>
                                {ctStyle?.label ?? ct}
                              </span>
                            )}
                            {meta?.label && <span className="text-[10.5px] text-neutral-500 truncate">{meta.label}</span>}
                          </div>
                        </div>
                      );
                    })}
                    </div>

                    {/* OUT 컬럼 (오른쪽 절반) */}
                    <div className="flex-1 min-w-0">
                    {outVis.map((p, renderIdx) => {
                      const meta = d.outputsMeta?.[p.name];
                      const ct = meta?.connType;
                      const ctStyle = ct ? CONN_TYPE_STYLES[ct] : undefined;
                      const lid = meta?.layerId;
                      const layer = lid ? layerById.get(lid) : undefined;
                      const portColor = layer?.color ?? color.main;
                      const isPending = pendingFrom?.device === d.id && pendingFrom?.port === p.name;
                      const isPgm = d.role === 'switcher' && d.pgmPort === p.name;
                      const isSwitcherViewMode = !editMode && d.role === 'switcher';
                      const isRouterViewMode = !editMode && d.role === 'router';
                      // 라우터 OUT에 매핑된 현재 IN (routing 또는 index fallback)
                      const routedIn = isRouterViewMode
                        ? (d.routing?.[p.name] ?? d.inputs[d.outputs.indexOf(p.name)] ?? d.inputs[0])
                        : null;
                      return (
                        <div
                          key={p.name}
                          className={`flex items-center justify-end ${
                            isSwitcherViewMode ? 'cursor-pointer hover:bg-emerald-500/10 rounded'
                            : isRouterViewMode ? 'cursor-pointer hover:bg-orange-500/10 rounded'
                            : ''
                          }`}
                          style={{ height: PORT_H }}
                          onClick={
                            isSwitcherViewMode
                              ? (e) => { e.stopPropagation(); setSwitcherPgm(d.id, p.name); }
                              : isRouterViewMode
                              ? (e) => { e.stopPropagation(); cycleRouterOutput(d.id, p.name); }
                              : undefined
                          }
                          title={
                            isSwitcherViewMode ? `클릭: ${p.name}을 PGM으로 지정/해제`
                            : isRouterViewMode ? `클릭: 다음 입력으로 전환 (현재 ← ${routedIn ?? 'N/A'})`
                            : undefined
                          }
                        >
                          <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0 mr-2">
                            {meta?.label && <span className="text-[10.5px] text-neutral-500 truncate text-right">{meta.label}</span>}
                            {isPgm && (
                              <span className="text-[9.5px] px-2 py-[2px] rounded font-mono font-bold shrink-0"
                                style={{ background: 'linear-gradient(90deg, #10b981, #059669)', color: 'white', boxShadow: '0 0 8px rgba(16,185,129,0.6)' }}>
                                PGM
                              </span>
                            )}
                            {/* 라우터 OUT에 현재 매핑된 IN 표시 */}
                            {isRouterViewMode && routedIn && (
                              <span className="text-[9px] px-1.5 py-[2px] rounded font-mono font-bold shrink-0"
                                style={{ background: 'rgba(249,115,22,0.2)', color: '#FB923C', border: '0.5px solid rgba(251,146,60,0.5)' }}>
                                ← {routedIn}
                              </span>
                            )}
                            {ct && (
                              <span className="text-[9.5px] px-1.5 py-[2px] rounded font-mono font-semibold shrink-0"
                                style={{ background: `${portColor}20`, color: portColor, border: `0.5px solid ${portColor}55`, boxShadow: `0 0 4px ${portColor}30` }}>
                                {ctStyle?.label ?? ct}
                              </span>
                            )}
                            <span className="text-[11.5px] text-neutral-200 font-mono truncate font-medium">{p.name}</span>
                          </div>
                          <button
                            data-port
                            onMouseDown={onPortMouseDown}
                            onClick={e => onPortClick(e, d.id, p.name, true)}
                            className={`w-3 h-3 rounded-full -mr-[6px] hover:scale-[1.6] transition-transform ring-2 shrink-0 ${isPending ? 'ring-amber-300/60 animate-pulse' : isPgm ? 'ring-emerald-400/60' : 'ring-black/40'}`}
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

                {/* Source preview - 비디오 이미지, 오디오 플레이어, combined는 둘 다 */}
                {isSource && ((d.imageUrl && d.imageUrl.trim()) || (d.audioUrl && d.audioUrl.trim())) && (
                  <div className="mx-2.5 mb-2.5 space-y-1.5">
                    {/* 이미지 */}
                    {d.imageUrl && d.imageUrl.trim() && (d.type === 'video' || d.type === 'combined') && (
                      <div className="relative rounded-md overflow-hidden border border-lime-500/25"
                        style={{ aspectRatio: '16/9', background: '#000' }}
                      >
                        <img
                          src={d.imageUrl}
                          alt={d.name}
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                        <div className="absolute top-1 left-1 flex items-center gap-1 px-1.5 py-0.5 rounded bg-lime-500/90 text-black text-[9px] font-bold">
                          <div className="w-1 h-1 rounded-full bg-white animate-pulse"></div>
                          LIVE
                        </div>
                      </div>
                    )}
                    {/* 오디오 */}
                    {d.audioUrl && d.audioUrl.trim() && (d.type === 'audio' || d.type === 'combined') && (
                      <div className="relative rounded-md overflow-hidden border border-rose-500/30 bg-black/60 px-2 py-1 flex items-center gap-1.5">
                        <span className="text-rose-300 text-[11px]">🎵</span>
                        <span className="text-[9px] text-rose-300 font-mono flex items-center gap-1">
                          <div className="w-1 h-1 rounded-full bg-rose-400 animate-pulse"></div>
                          AUDIO
                        </span>
                        <audio src={d.audioUrl} controls className="flex-1 h-6" data-ui style={{ minWidth: 0 }} />
                      </div>
                    )}
                  </div>
                )}

                {/* Display screen - 연결된 소스 재생 */}
                {isDisplay && (
                  <div className="mx-2.5 mb-2.5 space-y-1.5">
                    {/* 비디오 화면 */}
                    {(d.type === 'video' || d.type === 'combined') && (
                      <div className="relative rounded-md overflow-hidden border-2 border-neutral-700"
                        style={{ aspectRatio: '16/9', background: 'linear-gradient(180deg, #000 0%, #0a0a0a 100%)' }}
                      >
                        {currentDisplaySource?.imageUrl ? (
                          <>
                            <img
                              src={currentDisplaySource.imageUrl}
                              alt={currentDisplaySource.name}
                              className="w-full h-full object-cover"
                              draggable={false}
                            />
                            <div className="absolute top-1 right-1 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 text-emerald-300 text-[9px] font-bold font-mono">
                              <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></div>
                              {currentDisplaySource.name}
                            </div>
                          </>
                        ) : currentDisplaySource ? (
                          <div className="absolute inset-0 flex items-center justify-center text-neutral-600 text-[10px]">
                            📡 {currentDisplaySource.name} {currentDisplaySource.audioUrl && !currentDisplaySource.imageUrl ? '(오디오 전용)' : '(이미지 없음)'}
                          </div>
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-700">
                            <div className="text-[10px] font-mono">NO SIGNAL</div>
                            <div className="text-[8px] opacity-60 mt-0.5">소스 연결 대기</div>
                          </div>
                        )}
                        {/* 스캔라인 */}
                        <div className="absolute inset-0 pointer-events-none" style={{
                          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 3px)',
                        }}></div>
                      </div>
                    )}
                    {/* 오디오 플레이어 */}
                    {(d.type === 'audio' || d.type === 'combined') && (
                      <div className="relative rounded-md overflow-hidden border-2 border-rose-700/50 bg-gradient-to-r from-black to-rose-950/30 px-2 py-1.5 flex items-center gap-2">
                        <span className="text-rose-300 text-[11px]">🎵</span>
                        {currentDisplaySource?.audioUrl ? (
                          <>
                            <div className="text-[9px] text-rose-300 font-mono flex items-center gap-1 shrink-0">
                              <div className="w-1 h-1 rounded-full bg-rose-400 animate-pulse"></div>
                              {currentDisplaySource.name}
                            </div>
                            <audio
                              src={currentDisplaySource.audioUrl}
                              controls
                              className="flex-1 h-6"
                              data-ui
                              style={{ minWidth: 0 }}
                              key={currentDisplaySource.id + ':' + currentDisplaySource.audioUrl}
                            />
                          </>
                        ) : currentDisplaySource ? (
                          <span className="text-[10.5px] text-neutral-600 italic">
                            📡 {currentDisplaySource.name} (음원 없음)
                          </span>
                        ) : (
                          <span className="text-[10.5px] text-neutral-700 italic font-mono">NO AUDIO</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 멀티뷰 preview — PGM/PVW + 소스 셀 */}
                {isMultiview && (() => {
                  const layoutId = (d.multiviewLayout as MultiviewLayoutId | undefined) ?? 'pgm+pvw+6';
                  const layout = MULTIVIEW_LAYOUTS[layoutId] ?? MULTIVIEW_LAYOUTS['pgm+pvw+6'];
                  const sourceCellCount = layout.sourceCells;

                  // ===== 연동 스위처 모드 =====
                  const linkedSw = d.multiviewLinkedSwitcherId ? devById.get(d.multiviewLinkedSwitcherId) : null;

                  let pgmSrc: Device | null = null;
                  let pvwSrc: Device | null = null;
                  let sourceSrcList: Array<{ label: string; srcDev: Device | null; inputPort: string }> = [];
                  let statusLabel: string;

                  if (linkedSw && linkedSw.role === 'switcher') {
                    // 스위처의 PGM 출력에 실려 나가는 소스 = 스위처 selectedInput의 source
                    const pgmInputPort = linkedSw.selectedInput;
                    if (pgmInputPort) {
                      const srcId = signalByOutput.inSignal.get(`${linkedSw.id}:${pgmInputPort}`);
                      if (srcId) pgmSrc = devById.get(srcId) ?? null;
                    }
                    // PVW: 스위처의 pvwPort가 있으면 거기서, 없으면 selectedInput 외 임의
                    const pvwInputPort = linkedSw.pvwPort;
                    if (pvwInputPort) {
                      const srcId = signalByOutput.inSignal.get(`${linkedSw.id}:${pvwInputPort}`);
                      if (srcId) pvwSrc = devById.get(srcId) ?? null;
                    }
                    // 소스 모니터: 스위처의 각 IN에 도달한 source 목록 (순서대로)
                    sourceSrcList = linkedSw.inputs.slice(0, sourceCellCount).map((inp, i) => {
                      const srcId = signalByOutput.inSignal.get(`${linkedSw.id}:${inp}`);
                      const srcDev = srcId ? (devById.get(srcId) ?? null) : null;
                      const meta = linkedSw.inputsMeta?.[inp];
                      return {
                        label: meta?.label ?? inp,
                        srcDev,
                        inputPort: inp,
                      };
                    });
                    statusLabel = `🔗 ${linkedSw.name}`;
                  } else {
                    // ===== 수동 모드 =====
                    const pgmIn = d.multiviewPgmInput;
                    const pvwIn = d.multiviewPvwInput;
                    const sourceInputs = d.inputs.filter(p => p !== pgmIn && p !== pvwIn).slice(0, sourceCellCount);

                    const getSrc = (inputPort: string | undefined): Device | null => {
                      if (!inputPort) return null;
                      const srcId = signalByOutput.inSignal.get(`${d.id}:${inputPort}`);
                      if (!srcId) return null;
                      return devById.get(srcId) ?? null;
                    };

                    pgmSrc = getSrc(pgmIn);
                    pvwSrc = getSrc(pvwIn);
                    sourceSrcList = sourceInputs.map((inp, i) => ({
                      label: String(i + 1).padStart(2, '0'),
                      srcDev: getSrc(inp),
                      inputPort: inp,
                    }));
                    statusLabel = layout.label;
                  }

                  const srcCols = sourceCellCount <= 4 ? 2 : sourceCellCount <= 9 ? 3 : sourceCellCount <= 16 ? 4 : 5;
                  const hasPgmOrPvw = pgmSrc || pvwSrc || d.multiviewPgmInput || d.multiviewPvwInput || linkedSw;

                  return (
                    <div className="mx-2.5 mb-2.5 space-y-1.5">
                      {/* PGM + PVW 나란히 */}
                      {hasPgmOrPvw && (
                        <div className="grid grid-cols-2 gap-1">
                          <MultiviewCell label="PGM" inputPort={pgmSrc?.name ?? ''} srcDev={pgmSrc} color="emerald" big />
                          <MultiviewCell label="PVW" inputPort={pvwSrc?.name ?? ''} srcDev={pvwSrc} color="amber" big />
                        </div>
                      )}
                      {/* 소스 모니터 셀 그리드 */}
                      {sourceCellCount > 0 && (
                        <div
                          className="grid gap-0.5"
                          style={{ gridTemplateColumns: `repeat(${srcCols}, minmax(0, 1fr))` }}
                        >
                          {Array.from({ length: sourceCellCount }).map((_, i) => {
                            const entry = sourceSrcList[i];
                            return (
                              <MultiviewCell
                                key={i}
                                label={entry ? entry.label : String(i + 1).padStart(2, '0')}
                                inputPort={entry?.inputPort}
                                srcDev={entry?.srcDev ?? null}
                                color="slate"
                              />
                            );
                          })}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[8.5px] font-mono text-violet-300/60 px-0.5">
                        <span className="truncate">{statusLabel}</span>
                        <span>{linkedSw ? `${linkedSw.inputs.length}ch` : `${d.inputs.length}ch IN`}</span>
                      </div>
                    </div>
                  );
                })()}

              </div>

              {/* 왼쪽: IN 쪽 Hub 연결 배지 (각 IN 포트와 y좌표 정렬) */}
              {!isPatchbay && !isWallbox && role !== 'router' && inVis.length > 0 && (hubConnections.length > 0 || hidePatchbay) && (
                <div
                  data-ui
                  className="absolute flex flex-col items-end pointer-events-auto"
                  style={{
                    left: d.x - 160,
                    width: 154,
                    top: d.y + HEADER_H + PADDING_Y,
                    zIndex: 6,
                  }}
                >
                  {inVis.map((p) => {
                    // hidePatchbay 모드: 이 IN으로 오는 신호가 패치베이 체인을 거치는지 확인
                    if (hidePatchbay) {
                      const rev = followPathByFinalIn.get(`${d.id}:${p.name}`);
                      if (rev && rev.chain.length > 0) {
                        // 공통 코드: OUT에서 쓴 것과 동일
                        const firstHop = rev.chain[0];
                        const isRtHop = firstHop.hub.role === 'router';
                        const hubList = devices.filter(x => x.role === firstHop.hub.role);
                        const hubIdx = hubList.findIndex(x => x.id === firstHop.hub.id) + 1;
                        const portNum = firstHop.hub.inputs.indexOf(firstHop.inPort) + 1;
                        const prefix = isRtHop ? 'R' : 'P';
                        const code = `${prefix}${String(hubIdx).padStart(2, '0')}-${String(portNum).padStart(2, '0')}`;
                        const liveSrc = signalByOutput.inSignal.get(`${d.id}:${p.name}`);
                        const isLive = !!liveSrc;
                        const bg = isRtHop
                          ? (isLive
                              ? 'bg-orange-500/30 text-orange-100 border-orange-400 shadow-md shadow-orange-500/30'
                              : 'bg-orange-500/15 text-orange-200 border-orange-500/30')
                          : (isLive
                              ? 'bg-teal-500/30 text-teal-100 border-teal-400 shadow-md shadow-teal-500/30'
                              : 'bg-teal-500/15 text-teal-200 border-teal-500/30');
                        return (
                          <div key={p.name} className="flex items-center" style={{ height: PORT_H }}>
                            <div
                              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold text-left border whitespace-nowrap ${bg}`}
                              style={{ width: 130 }}
                              title={`${rev.sourceDev.name}에서 ${firstHop.hub.name} 경유 (${code})`}
                            >
                              <span className="text-[8px] opacity-70 truncate">{rev.sourceDev.name}</span>
                              <span className="ml-auto">{code}</span>
                            </div>
                          </div>
                        );
                      }
                    }
                    // 기본: hub(라우터/패치베이) 연결 배지 (hidePatchbay OFF 또는 패치베이 체인 아닌 hub)
                    const hc = hubConnections.find(x => x.myPort === p.name);
                    if (!hc) {
                      return <div key={p.name} style={{ height: PORT_H }}></div>;
                    }
                    // hidePatchbay 모드면 패치베이 hub는 이미 위에서 처리됐으므로 남은 건 router
                    if (hidePatchbay && hc.hub.role === 'patchbay') {
                      return <div key={p.name} style={{ height: PORT_H }}></div>;
                    }
                    const isRouter = hc.hub.role === 'router';
                    const isActive = inspectHubs.has(hc.hub.id);
                    let label: string;
                    if (isRouter) {
                      label = `${hc.hub.inputs.length}x${hc.hub.outputs.length} R/S ${hc.hubPort}`;
                    } else {
                      const idx = hubPortIndex(hc.hub, hc.hubPort, true);
                      label = `${hc.hub.name}-${String(idx).padStart(2, '0')}`;
                    }
                    return (
                      <div key={p.name} className="flex items-center" style={{ height: PORT_H }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectHubs(prev => {
                              const next = new Set(prev);
                              if (next.has(hc.hub.id)) next.delete(hc.hub.id);
                              else next.add(hc.hub.id);
                              return next;
                            });
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-medium transition text-left border ${
                            isActive
                              ? isRouter
                                ? 'bg-orange-500 text-white border-orange-400 shadow-md shadow-orange-500/40'
                                : 'bg-teal-500 text-white border-teal-400 shadow-md shadow-teal-500/40'
                              : isRouter
                                ? 'bg-orange-500/15 text-orange-200 border-orange-500/30 hover:bg-orange-500/30'
                                : 'bg-teal-500/15 text-teal-200 border-teal-500/30 hover:bg-teal-500/30'
                          }`}
                          title={`수신: ${hc.hub.name}/${hc.hubPort} → ${hc.myPort}${isActive ? '\n(클릭 → 선 숨기기)' : '\n(클릭 → 연결선 표시)'}`}
                        >
                          <span className="truncate">{label}</span>
                          <span className="text-[8px] opacity-75 shrink-0">→</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 오른쪽: OUT 포트 옆 dest 라벨 (설계도면 스타일, 각 포트와 y좌표 정렬) */}
              {!isPatchbay && !isWallbox && role !== 'router' && outVis.length > 0 && (
                <div
                  data-ui
                  className="absolute flex flex-col pointer-events-auto"
                  style={{
                    left: d.x + w + 6,
                    top: d.y + HEADER_H + PADDING_Y,  // OUT 포트 첫 행 시작 위치
                    zIndex: 6,
                  }}
                >
                  {outVis.map((p) => {
                    // hidePatchbay 모드: follow 로직으로 체인 전체 구성
                    // 일반 모드: 다음 홉만 표시
                    if (hidePatchbay) {
                      const followed = followPathFromOut(d.id, p.name);
                      if (!followed) {
                        // 허브 내부에서 신호가 끝나거나 연결 없음
                        const info = destInfoByOutPort.get(`${d.id}:${p.name}`);
                        if (!info || info.destDev.role === 'patchbay' || info.destDev.role === 'router') {
                          // 허브로만 연결된 포트 — 내부 연결 없음
                          if (info && (info.destDev.role === 'patchbay' || info.destDev.role === 'router')) {
                            const hubDev = info.destDev;
                            const isRt = hubDev.role === 'router';
                            const hubList = devices.filter(x => x.role === hubDev.role);
                            const hubIdx = hubList.findIndex(x => x.id === hubDev.id) + 1;
                            const hubPortNum = hubDev.inputs.indexOf(info.destConn.to_port) + 1;
                            const prefix = isRt ? 'R' : 'P';
                            const code = `${prefix}${String(hubIdx).padStart(2, '0')}-${String(hubPortNum).padStart(2, '0')}`;
                            const bg = isRt
                              ? 'bg-orange-500/10 text-orange-400/60 border-orange-500/20'
                              : 'bg-teal-500/10 text-teal-400/60 border-teal-500/20';
                            return (
                              <div key={p.name} className="flex items-center" style={{ height: PORT_H }}>
                                <div
                                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold text-left border ${bg}`}
                                  style={{ width: 130 }}
                                  title={`${hubDev.name} IN ${hubPortNum} · 내부 연결 없음`}
                                >
                                  <span className="font-bold">{code}</span>
                                  <span className="text-[8px] opacity-60 ml-auto">끊김</span>
                                </div>
                              </div>
                            );
                          }
                          return <div key={p.name} style={{ height: PORT_H, width: 130 }}></div>;
                        }
                      }
                      if (followed && followed.chain.length > 0) {
                        // 허브 경유: "P01-05" (패치베이) 또는 "R01-05" (라우터) 형식
                        const firstHop = followed.chain[0];
                        const isRtHop = firstHop.hub.role === 'router';
                        const hubList = devices.filter(x => x.role === firstHop.hub.role);
                        const hubIdx = hubList.findIndex(x => x.id === firstHop.hub.id) + 1;
                        const portNum = firstHop.hub.inputs.indexOf(firstHop.inPort) + 1;
                        const prefix = isRtHop ? 'R' : 'P';
                        const code = `${prefix}${String(hubIdx).padStart(2, '0')}-${String(portNum).padStart(2, '0')}`;
                        const liveSrc = signalByOutput.out.get(`${d.id}:${p.name}`);
                        const isLive = !!liveSrc;
                        // 허브 종류에 따라 색: 라우터=주황, 패치베이=청록
                        const bg = isRtHop
                          ? (isLive
                              ? 'bg-orange-500/30 text-orange-100 border-orange-400 shadow-md shadow-orange-500/30'
                              : 'bg-orange-500/15 text-orange-200 border-orange-500/30')
                          : (isLive
                              ? 'bg-teal-500/30 text-teal-100 border-teal-400 shadow-md shadow-teal-500/30'
                              : 'bg-teal-500/15 text-teal-200 border-teal-500/30');
                        return (
                          <div key={p.name} className="flex items-center" style={{ height: PORT_H }}>
                            <div
                              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold text-left border whitespace-nowrap ${bg}`}
                              style={{ width: 130 }}
                              title={`경로: ${firstHop.hub.name} IN${portNum} → OUT${firstHop.hub.outputs.indexOf(firstHop.outPort) + 1} → ${followed.finalDev.name}/${followed.finalPort}`}
                            >
                              <span>{code}</span>
                              <span className="text-[8px] opacity-70 truncate ml-auto">{followed.finalDev.name}</span>
                            </div>
                          </div>
                        );
                      }
                      if (followed && followed.chain.length === 0) {
                        // 직접 연결 (패치베이 아님) — 일반 모드처럼
                        const info = destInfoByOutPort.get(`${d.id}:${p.name}`);
                        if (info) {
                          const { destDev, destConn } = info;
                          const isRouter = destDev.role === 'router';
                          const label = isRouter
                            ? `${destDev.inputs.length}x${destDev.outputs.length} R/S ${destConn.to_port}`
                            : `${destDev.name}·${destConn.to_port}`;
                          const bgClass = isRouter
                            ? 'bg-orange-500/15 text-orange-200 border-orange-500/30'
                            : 'bg-white/5 text-neutral-400 border-white/15';
                          return (
                            <div key={p.name} className="flex items-center" style={{ height: PORT_H }}>
                              <div
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-medium text-left border ${bgClass}`}
                                style={{ width: 130 }}
                                title={`연결됨: ${destDev.name} / ${destConn.to_port}`}
                              >
                                <span className="text-[8px] opacity-75 shrink-0">→</span>
                                <span className="truncate">{label}</span>
                              </div>
                            </div>
                          );
                        }
                      }
                      return <div key={p.name} style={{ height: PORT_H, width: 130 }}></div>;
                    }

                    // 일반 모드: 바로 다음 홉만 표시 (기존 로직)
                    const info = destInfoByOutPort.get(`${d.id}:${p.name}`);
                    if (!info) {
                      return <div key={p.name} style={{ height: PORT_H }}></div>;
                    }
                    const { destDev, destConn } = info;
                    const isRouter = destDev.role === 'router';
                    const isPb = destDev.role === 'patchbay';
                    const isHub = isRouter || isPb;
                    const isActive = isHub && inspectHubs.has(destDev.id);

                    let label: string;
                    let bgClass: string;
                    if (isRouter) {
                      label = `${destDev.inputs.length}x${destDev.outputs.length} R/S ${destConn.to_port}`;
                      bgClass = isActive
                        ? 'bg-orange-500 text-white border-orange-400 shadow-md shadow-orange-500/40'
                        : 'bg-orange-500/15 text-orange-200 border-orange-500/30 hover:bg-orange-500/30';
                    } else if (isPb) {
                      const idx = destDev.inputs.indexOf(destConn.to_port);
                      label = `${destDev.name}-${String(idx >= 0 ? idx + 1 : 0).padStart(2, '0')}`;
                      bgClass = isActive
                        ? 'bg-teal-500 text-white border-teal-400 shadow-md shadow-teal-500/40'
                        : 'bg-teal-500/15 text-teal-200 border-teal-500/30 hover:bg-teal-500/30';
                    } else {
                      label = `${destDev.name}·${destConn.to_port}`;
                      bgClass = 'bg-white/5 text-neutral-400 border-white/15';
                    }

                    const content = (
                      <>
                        <span className="text-[8px] opacity-75 shrink-0">→</span>
                        <span className="truncate">{label}</span>
                      </>
                    );

                    return (
                      <div key={p.name} className="flex items-center" style={{ height: PORT_H }}>
                        {isHub ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectHubs(prev => {
                                const next = new Set(prev);
                                if (next.has(destDev.id)) next.delete(destDev.id);
                                else next.add(destDev.id);
                                return next;
                              });
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-medium transition text-left border ${bgClass}`}
                            title={`연결됨: ${destDev.name} / ${destConn.to_port}${isActive ? '\n(클릭 → 선 숨기기)' : '\n(클릭 → 연결선 표시)'}`}
                          >{content}</button>
                        ) : (
                          <div
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-medium text-left border ${bgClass}`}
                            title={`연결됨: ${destDev.name} / ${destConn.to_port}`}
                          >{content}</div>
                        )}
                      </div>
                    );
                  })}
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
          racks={racks}
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

      {showBulkEditor && selectedIds.size > 0 && (
        <BulkEditor
          devices={devices.filter(d => selectedIds.has(d.id))}
          layers={layers}
          onClose={() => setShowBulkEditor(false)}
        />
      )}

      {editingDevice && (
        <DeviceEditor
          device={editingDevice}
          layers={layers}
          allDevices={devices}
          selectionCount={selectedIds.size}
          onSave={handleSaveDevice}
          onSaveToSelection={async (updates) => {
            const ids = Array.from(selectedIds);
            // undefined 제거
            const clean: any = {};
            Object.entries(updates).forEach(([k, v]) => { if (v !== undefined) clean[k] = v; });
            // 낙관적 업데이트
            setDevices(prev => prev.map(d => ids.includes(d.id) ? { ...d, ...updates } : d));
            setEditingDevice(null);
            // 병렬 저장
            const results = await Promise.all(
              ids.map(id => (supabase as any).from('devices').update(clean).eq('id', id))
            );
            const errs = results.filter(r => r.error);
            if (errs.length > 0) {
              console.error('[Bulk apply errors]', errs);
              alert(`일괄 적용 중 ${errs.length}개 장비 실패. Console 확인.`);
            }
          }}
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
            const snapshot = { ...editingCable };
            await (supabase as any).from('connections').delete().eq('id', editingCable.id);
            pushUndo('케이블 삭제 되돌리기', async () => {
              await (supabase as any).from('connections').insert(snapshot);
            });
            setEditingCable(null);
          }}
        />
      )}
    </div>
  );
}
