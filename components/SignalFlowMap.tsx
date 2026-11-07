'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowLeft, Eye, Cable, Pencil, Layers, Plus, Minus, Undo2, Maximize, Settings2, ChevronDown, Check,
  Trash2, X, Users, Lock, Unlock, Wrench, SlidersHorizontal, Crosshair, Group, Ungroup,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal,
  AlignEndHorizontal, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
  Box, LayoutGrid, SlidersVertical, Server, CreditCard, Zap, PlugZap, Lightbulb, Plug,
  Route, Spline, Palette, Square, PanelsTopLeft, RotateCcw,
} from 'lucide-react';
import { supabase, Device, Connection, ConnectionType, Layer, DEFAULT_LAYERS, DEVICE_ROLE_LABELS, DeviceRole, Rack, MULTIVIEW_LAYOUTS, MultiviewLayoutId, Project, CONNECTION_TYPE_COLORS } from '../lib/supabase';
import { INITIAL_DEVICES, INITIAL_CONNECTIONS, TYPE_COLORS, CONN_TYPE_STYLES } from '../lib/initialData';
import DeviceEditor from './DeviceEditor';
import LayerPanel from './LayerPanel';
import CableEditor from './CableEditor';
import PatchbayManager from './PatchbayManager';
import WallboxManager from './WallboxManager';
import BulkEditor from './BulkEditor';
import ConnectionCanvas from './ConnectionCanvas';
import AudioMixerEditor from './AudioMixerEditor';
import ProjectSettingsModal from './ProjectSettingsModal';
import PanelboardEditor from './PanelboardEditor';
import BackgroundImageLayer from './BackgroundImageLayer';
import { computeBreakerLoad, deviceWatts, deviceAmps, breakerCapacityWatts, formatWatts, formatAmps } from '../lib/powerCalc';

const TOPBAR_H = 48;         // 상단 바 높이 (모든 화면 공통 1줄)
const MIN_SCALE = 0.15;
const MAX_SCALE = 2;

const PORT_H = 28;          // 22 → 28 (포트 행 간격 더 여유)
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

// ===== 역할 배지 스타일 (아이콘 · 배경 · 글자 · 테두리) =====
const ROLE_STYLE: Partial<Record<DeviceRole, { icon: string; bg: string; fg: string; bd: string }>> = {
  switcher:       { icon: '⇆', bg: 'rgba(16,185,129,0.15)', fg: '#34D399', bd: 'rgba(52,211,153,0.4)' },
  router:         { icon: '⇅', bg: 'rgba(249,115,22,0.18)', fg: '#FB923C', bd: 'rgba(251,146,60,0.45)' },
  splitter:       { icon: '⇶', bg: 'rgba(16,185,129,0.15)', fg: '#34D399', bd: 'rgba(52,211,153,0.4)' },
  patchbay:       { icon: '⊟', bg: 'rgba(20,184,166,0.15)', fg: '#2DD4BF', bd: 'rgba(45,212,191,0.4)' },
  wallbox:        { icon: '▦', bg: 'rgba(245,158,11,0.15)', fg: '#FBBF24', bd: 'rgba(251,191,36,0.4)' },
  source:         { icon: '▶', bg: 'rgba(132,204,22,0.2)',  fg: '#A3E635', bd: 'rgba(163,230,53,0.4)' },
  display:        { icon: '🖵', bg: 'rgba(14,165,233,0.18)', fg: '#38BDF8', bd: 'rgba(56,189,248,0.4)' },
  multiview:      { icon: '▦', bg: 'rgba(139,92,246,0.18)', fg: '#A78BFA', bd: 'rgba(167,139,250,0.45)' },
  audio_mixer:    { icon: '🎛', bg: 'rgba(244,63,94,0.18)',  fg: '#FB7185', bd: 'rgba(251,113,133,0.45)' },
  io_box:         { icon: '📦', bg: 'rgba(34,211,238,0.18)', fg: '#22D3EE', bd: 'rgba(34,211,238,0.45)' },
  panelboard:     { icon: '⚡', bg: 'rgba(245,158,11,0.2)',  fg: '#FBBF24', bd: 'rgba(251,191,36,0.5)' },
  power_supply:   { icon: '🔌', bg: 'rgba(234,179,8,0.2)',   fg: '#FACC15', bd: 'rgba(250,204,21,0.5)' },
  power_consumer: { icon: '💡', bg: 'rgba(249,115,22,0.2)',  fg: '#FB923C', bd: 'rgba(251,146,60,0.5)' },
  power_strip:    { icon: '🔌', bg: 'rgba(250,204,21,0.2)',  fg: '#FACC15', bd: 'rgba(250,204,21,0.5)' },
  connector:      { icon: '━', bg: 'rgba(148,163,184,0.15)', fg: '#CBD5E1', bd: 'rgba(203,213,225,0.3)' },
};

// 범례 — 케이블 색/패턴
const LEGEND_LINES: Array<{ name: string; color: string; desc: string; dash?: string }> = [
  { name: 'Video',    color: '#3B82F6', desc: '비디오 신호' },
  { name: 'Audio',    color: '#EF4444', desc: '오디오 신호' },
  { name: 'Tie-Line', color: '#A855F7', desc: '연결선',       dash: '1 4' },
  { name: 'Control',  color: '#10B981', desc: '제어 신호',    dash: '6 3' },
  { name: 'Power',    color: '#FACC15', desc: '전력 (W=V×A)' },
  { name: 'Network',  color: '#FFFFFF', desc: '네트워크',     dash: '6 3' },
  { name: 'Signal',   color: '#94A3B8', desc: '일반 신호',    dash: '4 4' },
  { name: 'Patch',    color: '#F97316', desc: '수동 패치',    dash: '5 4' },
];

// ===== 툴바 UI 프리미티브 =====
const TB_BASE = 'h-8 px-2 sm:px-2.5 inline-flex items-center gap-1.5 rounded-md text-[12px] font-medium whitespace-nowrap shrink-0 transition-colors';
const TB_IDLE = 'text-neutral-300 hover:text-white hover:bg-white/10';
const TB_ON = 'bg-white/15 text-white';

function TbButton({ active, onClick, title, children, className = '' }: {
  active?: boolean; onClick?: () => void; title?: string; children: ReactNode; className?: string;
}) {
  return (
    <button type="button" onClick={onClick} title={title} className={`${TB_BASE} ${active ? TB_ON : TB_IDLE} ${className}`}>
      {children}
    </button>
  );
}

// 드롭다운 메뉴 — 바깥 클릭 / Esc 로 닫힘
function Dropdown({ label, title, align = 'left', buttonClassName = '', children }: {
  label: ReactNode; title?: string; align?: 'left' | 'right'; buttonClassName?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('touchstart', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('touchstart', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0" data-ui>
      <button type="button" title={title} aria-expanded={open} onClick={() => setOpen(o => !o)}
        className={`${TB_BASE} ${open ? TB_ON : TB_IDLE} ${buttonClassName}`}>
        {label}
        <ChevronDown size={13} className="hidden sm:block opacity-60 -mr-0.5" />
      </button>
      {open && (
        <div className={`absolute top-full mt-1.5 ${align === 'right' ? 'right-0' : 'left-0'} z-50 min-w-[230px] max-h-[70vh] overflow-y-auto rounded-lg border border-white/10 bg-neutral-900 shadow-2xl shadow-black/60 py-1`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, hint, checked, danger, onClick }: {
  icon?: ReactNode; label: ReactNode; hint?: ReactNode; checked?: boolean; danger?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12.5px] ${danger ? 'text-rose-300 hover:bg-rose-500/15' : 'text-neutral-200 hover:bg-white/10'}`}>
      <span className="w-4 flex justify-center shrink-0 text-neutral-400">{icon}</span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {hint !== undefined && <span className="text-[11px] text-neutral-500 font-mono shrink-0">{hint}</span>}
      {checked !== undefined && (
        <span className={`w-4 shrink-0 flex justify-center ${checked ? 'text-sky-400' : 'text-transparent'}`}><Check size={14} /></span>
      )}
    </button>
  );
}
const MenuLabel = ({ children }: { children: ReactNode }) => (
  <div className="px-3 pt-2 pb-1 text-[10.5px] font-semibold tracking-wider text-neutral-500">{children}</div>
);
const MenuDivider = () => <div className="my-1 border-t border-white/10" />;
const BarSep = () => <div className="w-px h-5 bg-white/10 mx-0.5 shrink-0" />;

export default function SignalFlowMap({ project }: { project?: Project } = {}) {
  const projectId = project?.id ?? 'default';
  // 프로젝트 메타는 편집 가능하므로 로컬 state로 관리
  const [currentProject, setCurrentProject] = useState<Project | null>(project ?? null);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  // 배경 이미지 transform — currentProject에서 초기화, 드래그/리사이즈 시 업데이트
  const [bgImgX, setBgImgX] = useState<number>(0);
  const [bgImgY, setBgImgY] = useState<number>(0);
  const [bgImgWidth, setBgImgWidth] = useState<number>(0);
  const [bgImgHeight, setBgImgHeight] = useState<number>(0);
  const [bgImgNaturalSize, setBgImgNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [bgKeepAspect, setBgKeepAspect] = useState<boolean>(false);

  // currentProject 변경 시 배경 이미지 transform 동기화
  useEffect(() => {
    setBgImgX(currentProject?.background_x ?? 0);
    setBgImgY(currentProject?.background_y ?? 0);
    // width/height가 정의되어 있으면 그대로, 없으면 scale (legacy) 또는 자연크기 기반
    const w = currentProject?.background_width;
    const h = currentProject?.background_height;
    if (typeof w === 'number' && w > 0) setBgImgWidth(w);
    if (typeof h === 'number' && h > 0) setBgImgHeight(h);
    setBgKeepAspect(currentProject?.background_keep_aspect ?? false);
  }, [currentProject?.id, currentProject?.background_x, currentProject?.background_y, currentProject?.background_width, currentProject?.background_height, currentProject?.background_keep_aspect]);
  // 용어 오버라이드 — t('PGM') 식으로 사용. 정의 안 되어 있으면 원본 반환.
  const terminology = currentProject?.terminology ?? {};
  const t = (key: string): string => terminology[key] ?? key;
  // 활성화된 장비 역할 — 비어있거나 undefined면 모두 활성
  const enabledRoles = currentProject?.enabled_roles ?? [];
  const isRoleEnabled = (role: string): boolean => {
    if (!enabledRoles || enabledRoles.length === 0) return true;
    return enabledRoles.includes(role as any);
  };
  const [devices, setDevices] = useState<Device[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(1);

  // 모드: view (보기) / connect (연결) / edit (편집)
  // 호환성을 위해 editMode는 'connect' 또는 'edit'일 때 true 처럼 동작
  type ViewMode = 'view' | 'connect' | 'edit';
  const [viewMode, setViewMode] = useState<ViewMode>('view');
  // 아이콘 모드 — 모든 카드를 작게 압축 표시 (도면 한눈에 보기)
  const [iconMode, setIconMode] = useState(false);
  const editMode = viewMode !== 'view';   // 기존 코드 호환
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [traceId, setTraceId] = useState<string | null>(null);
  // 라우터/패치베이 연결선 표시 토글 — 이 Set에 포함된 장비만 라인 표시
  const [inspectHubs, setInspectHubs] = useState<Set<string>>(new Set());
  // 도면에 패치베이 카드/관련 연결선 숨김 토글 — 기본 ON
  const [hidePatchbay, setHidePatchbay] = useState<boolean>(true);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [editingMixer, setEditingMixer] = useState<Device | null>(null);
  const [editingPanel, setEditingPanel] = useState<Device | null>(null);
  const [editingCable, setEditingCable] = useState<Connection | null>(null);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showPatchbayMgr, setShowPatchbayMgr] = useState(false);
  const [showWallboxMgr, setShowWallboxMgr] = useState(false);
  const [showBulkEditor, setShowBulkEditor] = useState(false);
  const [pendingFrom, setPendingFrom] = useState<{ device: string; port: string; connType?: ConnectionType } | null>(null);

  // ===== 뷰포트 (팬/줌) =====
  // 팬/줌 중에는 React 재렌더 없이 DOM·Canvas만 직접 갱신하고(applyView),
  // 동작이 끝났을 때 한 번만 재렌더(commitView)해서 컬링·라벨 LOD를 갱신한다.
  // → 이전: 마우스 이동 1프레임마다 전체 도면(모든 카드) 재렌더 → 버벅임의 주원인
  const viewRef = useRef<{ scale: number; offset: { x: number; y: number } }>({ scale: 0.7, offset: { x: 40, y: 40 } });
  const [, setViewCommit] = useState(0);
  const scale = viewRef.current.scale;
  const offset = viewRef.current.offset;
  const worldElRef = useRef<HTMLDivElement>(null);
  const viewportElRef = useRef<HTMLDivElement>(null);
  const zoomLabelRef = useRef<HTMLButtonElement>(null);
  const viewCommitTimerRef = useRef<number | null>(null);

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
    // device drag 중 움직일 DOM(카드 + 카드 옆 라벨) 캐시
    dragEls?: Array<{ el: HTMLElement; left: number; top: number }>;
  }>({ type: 'none', downX: 0, downY: 0, shiftKey: false, moved: false });

  // 마키(영역 선택) — state 대신 ref + DOM 직접 갱신 (드래그 중 매 프레임 재렌더 방지)
  const marqueeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeElRef = useRef<SVGRectElement>(null);
  const drawMarquee = (r: { x: number; y: number; w: number; h: number } | null) => {
    marqueeRef.current = r;
    const el = marqueeElRef.current;
    if (!el) return;
    if (!r) { el.setAttribute('display', 'none'); return; }
    el.setAttribute('display', 'inline');
    el.setAttribute('x', String(r.x));
    el.setAttribute('y', String(r.y));
    el.setAttribute('width', String(r.w));
    el.setAttribute('height', String(r.h));
  };

  // 캔버스 크기 추적 (window resize 대응)
  const [viewport, setViewport] = useState({ w: 1920, h: 1080 });
  // Canvas imperative handle — 드래그/팬 중 React state 없이 직접 redraw
  const connectionCanvasRef = useRef<any>(null);
  // 현재 드래그 중인 ID + 오프셋 (Canvas에 imperative로 전달)
  const dragOffsetRef = useRef<{ ids: Set<string>; worldDx: number; worldDy: number } | null>(null);

  // 뷰 변환을 DOM/Canvas에 즉시 반영 (React 재렌더 없음)
  const applyView = (s: number, o: { x: number; y: number }) => {
    viewRef.current = { scale: s, offset: o };
    const w = worldElRef.current;
    if (w) w.style.transform = `translate(${o.x}px, ${o.y}px) scale(${s})`;
    const vp = viewportElRef.current;
    if (vp) {
      vp.style.backgroundSize = `${24 * s}px ${24 * s}px`;
      vp.style.backgroundPosition = `${o.x}px ${o.y}px`;
    }
    connectionCanvasRef.current?.updateTransform(s, o.x, o.y);
    const lbl = zoomLabelRef.current?.firstChild;
    if (lbl) lbl.nodeValue = `${Math.round(s * 100)}%`;
  };
  // 팬/줌이 끝났을 때 1회 재렌더 (컬링/라벨 갱신)
  const commitView = () => {
    if (viewCommitTimerRef.current != null) { clearTimeout(viewCommitTimerRef.current); viewCommitTimerRef.current = null; }
    worldElRef.current?.classList.remove('is-moving', 'is-zooming');
    setViewCommit(n => n + 1);
  };
  // 휠/핀치처럼 끝 신호가 없는 연속 입력 — 잠잠해지면 커밋
  // (줌에는 GPU 레이어(is-moving)를 쓰지 않음 — 배율이 바뀔 때마다 도면 전체를 다시 래스터해서 오히려 느림.
  //  측정: 휠 p95 66ms → 33ms. 팬은 반대로 레이어가 있어야 빠름: p95 50ms → 17ms)
  const scheduleCommitView = (ms = 160) => {
    worldElRef.current?.classList.add('is-zooming');
    if (viewCommitTimerRef.current != null) clearTimeout(viewCommitTimerRef.current);
    viewCommitTimerRef.current = window.setTimeout(commitView, ms);
  };
  const setView = (s: number, o: { x: number; y: number }) => { applyView(s, o); commitView(); };
  // 화면(캔버스 영역) 좌표 sx,sy 를 고정점으로 factor 배 확대/축소한 결과
  const zoomAround = (factor: number, sx: number, sy: number) => {
    const { scale: s0, offset: o0 } = viewRef.current;
    const s1 = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s0 * factor));
    const wx = (sx - o0.x) / s0;
    const wy = (sy - o0.y) / s0;
    return { s: s1, o: { x: sx - wx * s1, y: sy - wy * s1 } };
  };
  // 버튼 줌 — 화면 중앙 기준
  const zoomBy = (factor: number) => {
    const r = viewportElRef.current?.getBoundingClientRect();
    const { s, o } = zoomAround(factor, (r?.width ?? viewport.w) / 2, (r?.height ?? viewport.h - TOPBAR_H) / 2);
    setView(s, o);
  };
  // 브라우저 좌표 → 도면(world) 좌표
  const screenToWorld = (clientX: number, clientY: number) => {
    const r = viewportElRef.current?.getBoundingClientRect();
    const { scale: s, offset: o } = viewRef.current;
    return { x: (clientX - (r?.left ?? 0) - o.x) / s, y: (clientY - (r?.top ?? TOPBAR_H) - o.y) / s };
  };
  // 새 장비를 놓을 위치 — 현재 화면의 왼쪽 위 근처
  const spawnPos = () => {
    const { scale: s, offset: o } = viewRef.current;
    return { x: (-o.x + 400) / s, y: (-o.y + 160) / s };
  };

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
  const stateRef = useRef({ editMode, viewMode, devices, selectedIds, visibleLayerIds: new Set<string>(), layers, modalOpen: false });

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
  stateRef.current.editMode = editMode;
  stateRef.current.viewMode = viewMode;
  stateRef.current.devices = devices;
  stateRef.current.selectedIds = selectedIds;
  stateRef.current.layers = layers;

  // ===== Load data =====
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [devRes, connRes, layerRes, rackRes] = await Promise.all([
        supabase.from('devices').select('*').eq('project_id', projectId),
        supabase.from('connections').select('*').eq('project_id', projectId),
        supabase.from('layers').select('*').eq('project_id', projectId),
        supabase.from('racks').select('*').eq('project_id', projectId),
      ]);
      let loadedLayers = (layerRes.data ?? []) as Layer[];
      if (loadedLayers.length === 0) {
        // 기본 레이어 생성 (project_id 포함)
        const defaults = DEFAULT_LAYERS.map(l => ({ ...l, id: `${l.id}_${projectId}`, project_id: projectId }));
        await (supabase as any).from('layers').insert(defaults);
        loadedLayers = defaults as any;
      } else {
        // 기존 프로젝트에 Power/Network 레이어가 없으면 추가
        const hasName = (n: string) => loadedLayers.some(l => (l.name ?? '').toLowerCase() === n.toLowerCase());
        const toAdd: Layer[] = [];
        if (!hasName('Power') && !hasName('전력')) {
          toAdd.push({ id: `layer_power_${projectId}`, name: 'Power', color: '#FACC15', visible: true, sort_order: 90, project_id: projectId } as any);
        }
        if (!hasName('Network') && !hasName('네트워크')) {
          toAdd.push({ id: `layer_network_${projectId}`, name: 'Network', color: '#FFFFFF', visible: true, sort_order: 91, project_id: projectId } as any);
        }
        if (toAdd.length > 0) {
          await (supabase as any).from('layers').insert(toAdd);
          loadedLayers = [...loadedLayers, ...toAdd];
        }
      }
      setLayers(loadedLayers);
      setRacks((rackRes.data ?? []) as Rack[]);
      if (devRes.data && devRes.data.length > 0) {
        setDevices(devRes.data as any);
        setConnections((connRes.data ?? []) as any);
      } else if (projectId === 'default') {
        // 'default' 프로젝트만 INITIAL_DEVICES 시드 사용
        await (supabase as any).from('devices').insert(INITIAL_DEVICES.map(d => ({ ...d, project_id: 'default' })));
        const connsToSeed = INITIAL_CONNECTIONS.map(c => ({ ...c, id: crypto.randomUUID(), project_id: 'default' }));
        await (supabase as any).from('connections').insert(connsToSeed);
        setDevices(INITIAL_DEVICES.map(d => ({ ...d, project_id: 'default' })) as any);
        setConnections(connsToSeed as any);
      }
      // 'default' 외 신규 프로젝트는 빈 상태로 시작
      setLoading(false);
    })();

    // 실시간 동기화 — INSERT/UPDATE는 서버에서 이 프로젝트 것만 받도록 필터
    // (이전: 모든 프로젝트의 변경을 전부 받아서 클라이언트에서 버림 / racks는 필터 자체가 없었음)
    // DELETE 이벤트는 Supabase에서 필터를 지원하지 않으므로 id로 로컬에 있는 것만 반영
    const ch = (supabase as any).channel(`sfm_${projectId}`);
    const pf = `project_id=eq.${projectId}`;
    const upsertById = <T extends { id: string }>(prev: T[], row: T): T[] => {
      const i = prev.findIndex(x => x.id === row.id);
      if (i < 0) return [...prev, row];
      const next = prev.slice();
      next[i] = row;
      return next;
    };
    const subscribeTable = <T extends { id: string }>(table: string, set: (fn: (prev: T[]) => T[]) => void) => {
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: pf }, (p: any) => set(prev => upsertById(prev, p.new)))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: pf }, (p: any) => set(prev => upsertById(prev, p.new)))
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p: any) => {
          const id = p.old?.id;
          if (!id) return;
          set(prev => (prev.some(x => x.id === id) ? prev.filter(x => x.id !== id) : prev));
        });
    };
    subscribeTable<Device>('devices', setDevices);
    subscribeTable<Connection>('connections', setConnections);
    subscribeTable<Layer>('layers', setLayers);
    subscribeTable<Rack>('racks', setRacks);
    ch.on('presence', { event: 'sync' }, () => {
      setOnline(Object.keys(ch.presenceState()).length || 1);
    });
    ch.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') await ch.track({ user_id: crypto.randomUUID() });
    });
    return () => { (supabase as any).removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const devById = useMemo(() => new Map(devices.map(d => [d.id, d])), [devices]);

  // 허브(패치베이/라우터) 순번 — "P01-05" 코드용. (이전: 포트마다 devices.filter()로 매번 재계산)
  const hubOrdinal = useMemo(() => {
    const m = new Map<string, number>();
    let pb = 0, rt = 0;
    devices.forEach(d => {
      if (d.role === 'patchbay') m.set(d.id, ++pb);
      else if (d.role === 'router') m.set(d.id, ++rt);
    });
    return m;
  }, [devices]);
  const hubCode = (hub: Device, inPort: string) => {
    const prefix = hub.role === 'router' ? 'R' : 'P';
    const n = hubOrdinal.get(hub.id) ?? 0;
    const portNum = hub.inputs.indexOf(inPort) + 1;
    return `${prefix}${String(n).padStart(2, '0')}-${String(portNum).padStart(2, '0')}`;
  };

  // ===== 전력 과부하 추적 =====
  // breakerLoads: panelboardId → breakerId → BreakerLoad
  // overloadConsumerIds: 과부하 차단기에 연결된 모든 소비 장비 ID
  const { breakerLoads, overloadPanelIds, overloadConsumerIds } = useMemo(() => {
    const loadMap = new Map<string, Map<string, ReturnType<typeof computeBreakerLoad>>>();
    const overloadPanels = new Set<string>();
    const overloadConsumers = new Set<string>();
    devices.forEach(panel => {
      if (panel.role !== 'panelboard') return;
      if (!panel.breakers || panel.breakers.length === 0) return;
      const inner = new Map<string, ReturnType<typeof computeBreakerLoad>>();
      panel.breakers.forEach(br => {
        const load = computeBreakerLoad(panel, br, devices, connections as any);
        inner.set(br.id, load);
        if (load.overload) {
          overloadPanels.add(panel.id);
          load.consumers.forEach(c => overloadConsumers.add(c.id));
        }
      });
      loadMap.set(panel.id, inner);
    });
    return {
      breakerLoads: loadMap,
      overloadPanelIds: overloadPanels,
      overloadConsumerIds: overloadConsumers,
    };
  }, [devices, connections]);

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

  // visibleDeviceIds(아래 useMemo)로 O(1) 조회 — 이전엔 호출마다 포트 배열을 다시 필터링
  const isDeviceVisible = (d: Device): boolean => visibleDeviceIds.has(d.id);
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
      // 전력 공급 장비는 항상 전력 신호 발신
      if (d.role === 'power_supply') {
        d.outputs.forEach(p => out.set(`${d.id}:${p}`, d.id));
      }
    });

    // 패치베이 OUT → 소스 IN 매핑을 루프 밖에서 1회만 계산
    // (이전: 반복 × 패치베이 × 전체 연결 수 만큼 매번 다시 훑음)
    // 우선순위는 기존과 동일 — 수동 패치(자기 자신 연결) 먼저, 없으면 normals
    const selfPatches = new Map<string, Map<string, string>>(); // devId → (to_port → from_port)
    connections.forEach(c => {
      if (c.from_device !== c.to_device || !c.is_patch) return;
      let m = selfPatches.get(c.from_device);
      if (!m) { m = new Map(); selfPatches.set(c.from_device, m); }
      m.set(c.to_port, c.from_port);
    });
    const patchbayOutToIn = new Map<string, Map<string, string>>();
    devices.forEach(d => {
      if (d.role !== 'patchbay') return;
      const rev = new Map<string, string>();
      const patches = selfPatches.get(d.id);
      if (patches) for (const [pIn, pOut] of patches) if (!rev.has(pOut)) rev.set(pOut, pIn);
      if (d.normals) for (const [nIn, nOut] of Object.entries(d.normals)) if (!rev.has(nOut)) rev.set(nOut, nIn);
      patchbayOutToIn.set(d.id, rev);
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
          const rev = patchbayOutToIn.get(d.id);
          if (!rev) return;
          d.outputs.forEach(outPort => {
            const sourceIn = rev.get(outPort);
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

        // 배전반 / 멀티탭 — IN으로 들어온 전력을 모든 OUT으로 분배
        if (d.role === 'panelboard' || d.role === 'power_strip') {
          // IN 포트 어느 하나라도 신호 있으면 모든 OUT으로
          let srcSig: string | undefined;
          for (const inp of d.inputs) {
            const sig = inSignal.get(`${d.id}:${inp}`);
            if (sig) { srcSig = sig; break; }
          }
          if (!srcSig) return;
          d.outputs.forEach(p => {
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

  // "장비:OUT포트" → 그 포트에서 나가는 연결 목록 (추적 BFS용 인덱스)
  const connListByFromPort = useMemo(() => {
    const m = new Map<string, Connection[]>();
    connections.forEach(c => {
      const k = `${c.from_device}:${c.from_port}`;
      const a = m.get(k);
      if (a) a.push(c); else m.set(k, [c]);
    });
    return m;
  }, [connections]);

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
      let head = 0;
      while (head < queue.length) {
        const cur = queue[head++];
        const key = `${cur.devId}:${cur.port}:${cur.isOut ? 'o' : 'i'}`;
        if (visited.has(key)) continue;
        visited.add(key);

        if (cur.isOut) {
          // OUT 포트 → 연결된 to_device/to_port의 IN으로 전달 (인덱스 조회 — 이전엔 매 홉마다 전체 연결 스캔)
          (connListByFromPort.get(`${cur.devId}:${cur.port}`) ?? []).forEach(c => {
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
    } else if (startDev.role === 'source' || startDev.role === 'power_supply') {
      // 이 소스/공급장비가 도달하는 모든 장비 추적
      collectPathBetween(traceId);
    } else if (startDev.role === 'power_consumer') {
      // 소비 장비 클릭 — 어떤 공급에서 오는지 추적
      startDev.inputs.forEach(p => {
        pSet.add(`${traceId}:${p}`);
        const srcId = signalByOutput.inSignal.get(`${traceId}:${p}`);
        if (srcId) collectPathBetween(srcId, traceId);
      });
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

    return { devices: dSet, connections: cSet, ports: pSet };
  }, [traceId, devById, connListByFromPort, signalByOutput]);


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

  // 보이는 장비 집합 — 포트가 하나도 없거나, 보이는 레이어의 포트가 1개 이상인 장비
  const visibleDeviceIds = useMemo(() => {
    const s = new Set<string>();
    devices.forEach(d => {
      if (d.inputs.length + d.outputs.length === 0) { s.add(d.id); return; }
      const c = visiblePortsCache.get(d.id);
      if (c && c.in.length + c.out.length > 0) s.add(d.id);
    });
    return s;
  }, [devices, visiblePortsCache]);

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
      let fi = outVis.findIndex(p => p.name === c.from_port);
      let ti = inVis.findIndex(p => p.name === c.to_port);
      // 포트가 레이어 필터로 숨겨졌을 때:
      // — 원본 outputs/inputs에서의 위치를 보이는 포트들 사이에 비례 보간으로 매핑
      // — 카드 밖으로 튀어나가지 않게
      if (fi < 0) {
        const origIdx = from.outputs.indexOf(c.from_port);
        if (origIdx < 0) return;  // 포트 진짜 삭제됨
        // 보이는 포트가 없으면 인덱스 0 (카드 첫 행)
        if (outVis.length === 0) fi = 0;
        else {
          // 원본 인덱스를 보이는 인덱스 비율로 스케일
          const ratio = origIdx / Math.max(1, from.outputs.length - 1);
          fi = Math.round(ratio * (outVis.length - 1));
          fi = Math.max(0, Math.min(outVis.length - 1, fi));
        }
      }
      if (ti < 0) {
        const origIdx = to.inputs.indexOf(c.to_port);
        if (origIdx < 0) return;
        if (inVis.length === 0) ti = 0;
        else {
          const ratio = origIdx / Math.max(1, to.inputs.length - 1);
          ti = Math.round(ratio * (inVis.length - 1));
          ti = Math.max(0, Math.min(inVis.length - 1, ti));
        }
      }

      // 아이콘 모드: 모든 케이블이 카드 헤더 중앙에 모이도록
      // 카드 width=96, height=36으로 강제됨
      const ICON_W = 96;
      const ICON_H = 36;
      const x1 = iconMode ? from.x + ICON_W : from.x + deviceWidth(from);
      const y1 = iconMode ? from.y + ICON_H / 2 : portYFromRenderIdx(from, fi);
      const x2 = iconMode ? to.x : to.x;
      const y2 = iconMode ? to.y + ICON_H / 2 : portYFromRenderIdx(to, ti);

      const fromLayerId = from.outputsMeta?.[c.from_port]?.layerId;
      const layerColor = fromLayerId ? layerById.get(fromLayerId)?.color : undefined;
      // 연결 타입 우선 (POWER/NETWORK/SIGNAL/LAN — 명확한 색)
      const typeColor = c.conn_type ? CONNECTION_TYPE_COLORS[c.conn_type as ConnectionType] : undefined;
      const baseColor = typeColor ?? layerColor ?? (from.type === 'audio' ? TYPE_COLORS.audio.main : from.type === 'combined' ? TYPE_COLORS.combined.main : TYPE_COLORS.video.main);
      const isPgm = from.role === 'switcher' && from.pgmPort === c.from_port;
      const isPatch = c.is_patch === true;
      const isTraced = traced.connections.has(c.id);
      const color = isPatch ? '#F97316' : baseColor;

      // NaN/undefined 좌표 가드 — 어떤 이유든 잘못된 값이면 케이블 skip
      if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return;

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
  }, [connections, devices, traced, hidePatchbay, inspectHubs, visiblePortsCache, traceId, layerById, iconMode]);

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
  const fitRef = useRef<() => void>(() => {});
  useEffect(() => {
    // 키보드: Cmd/Ctrl+Z — 편집모드 undo / Esc — 연결대기·추적·선택 해제 / F — 전체 보기
    const onKey = async (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      const tag = (ae?.tagName ?? '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || !!ae?.isContentEditable;
      if (typing) return; // 입력 중이면 브라우저 기본 동작에 맡김
      const modalOpen = stateRef.current.modalOpen;
      if (e.key === 'Escape' && !modalOpen) {
        setPendingFrom(null);
        setTraceId(null);
        setSelectedIds(prev => (prev.size ? new Set() : prev));
        return;
      }
      if (!modalOpen && (e.key === 'f' || e.key === 'F' || e.key === 'ㄹ') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        fitRef.current();
        return;
      }
      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z' || e.key === 'ㅋ');
      if (!isUndo) return;
      // 편집모드 아니면 무시
      if (!stateRef.current.editMode) return;
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
        // 캔버스 팬 — React 재렌더 없이 transform만 갱신 (끝날 때 commitView 1회)
        if (!p.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
          p.moved = true;
          worldElRef.current?.classList.add('is-moving');
          document.body.classList.add('is-dragging');
        }
        if (p.moved) applyView(viewRef.current.scale, { x: p.origOffset.x + dx, y: p.origOffset.y + dy });
      } else if (p.type === 'device' && p.origPositions) {
        if (p.moved || Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          if (!p.moved) {
            p.moved = true;
            // ⚠ setState 호출하면 React가 rerender → 카드 left/top이 d.x/d.y로 덮어써짐
            // 따라서 DOM body class 직접 조작 (rerender 없이 cursor만 변경)
            document.body.classList.add('dragging-device', 'is-dragging');
            // 움직일 DOM을 한 번만 찾아 캐시 — 카드 + 카드 옆 IN/OUT 라벨(data-follow)
            const els: Array<{ el: HTMLElement; left: number; top: number }> = [];
            Object.keys(p.origPositions).forEach(id => {
              const sel = `[data-device-id="${CSS.escape(id)}"], [data-follow="${CSS.escape(id)}"]`;
              document.querySelectorAll<HTMLElement>(sel).forEach(el => {
                els.push({ el, left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0 });
              });
            });
            p.dragEls = els;
          }
          const sc = viewRef.current.scale;
          const worldDx = dx / sc;
          const worldDy = dy / sc;
          // DOM 직접 조작 — React setState 우회해서 드래그 중 성능 극대화
          p.dragEls?.forEach(({ el, left, top }) => {
            el.style.left = `${left + worldDx}px`;
            el.style.top = `${top + worldDy}px`;
          });
          // Canvas에 드래그 오프셋 전달 — React state 없이 imperative redraw
          const newDragOffset = { ids: new Set(Object.keys(p.origPositions)), worldDx, worldDy };
          dragOffsetRef.current = newDragOffset;
          connectionCanvasRef.current?.updateDragOffset(newDragOffset);
        }
      } else if (p.type === 'marquee' && p.worldStartX !== undefined && p.worldStartY !== undefined) {
        const wpt = screenToWorld(e.clientX, e.clientY);
        const x = Math.min(p.worldStartX, wpt.x);
        const y = Math.min(p.worldStartY, wpt.y);
        const w = Math.abs(wpt.x - p.worldStartX);
        const h = Math.abs(wpt.y - p.worldStartY);
        drawMarquee({ x, y, w, h });
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
      // 포인터 상태는 즉시 초기화 — 아래 DB 저장(await) 중 새 드래그가 시작돼도 덮어쓰지 않도록
      pointerRef.current = { type: 'none', downX: 0, downY: 0, shiftKey: false, moved: false };
      document.body.classList.remove('dragging-device', 'is-dragging', 'is-panning', 'is-marquee');

      if (p.type === 'device') {
        if (p.moved) {
          // DOM-direct 드래그 종료: 최종 위치를 state에 한 번에 반영
          const origs = p.origPositions;
          const ids = p.dragIds ?? [];
          let finalPositions: Record<string, {x:number;y:number}> = {};
          if (origs) {
            // dragOffsetRef의 정확한 worldDx/Dy를 사용 (DOM에서 읽지 않고)
            const dragOff = dragOffsetRef.current;
            const wDx = dragOff?.worldDx ?? 0;
            const wDy = dragOff?.worldDy ?? 0;
            ids.forEach(id => {
              const orig = origs[id];
              if (orig) {
                finalPositions[id] = {
                  x: orig.x + wDx,
                  y: orig.y + wDy,
                };
              }
            });
            // React state 업데이트 — flushSync로 commit 강제 (Canvas와 동기화)
            // setDevices 후 React 렌더 commit이 끝나야 새 cables가 계산되어 ConnectionCanvas가 새 좌표로 그림
            flushSync(() => {
              setDevices(prev => prev.map(dev =>
                finalPositions[dev.id] ? { ...dev, ...finalPositions[dev.id] } : dev
              ));
            });
            // 이제 React가 commit 끝났으니 dragOffset 즉시 해제 가능 — race 없음
            dragOffsetRef.current = null;
            connectionCanvasRef.current?.updateDragOffset(null);
          } else {
            dragOffsetRef.current = null;
            connectionCanvasRef.current?.updateDragOffset(null);
          }
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
                // 연결 모드에서는 장비 클릭으로 편집 모달 안 열림 — 선택만
                if (stateRef.current.viewMode === 'connect') {
                  // 그냥 선택만, 편집 진입 X
                } else if (clickedDev.role === 'audio_mixer') {
                  setEditingMixer(clickedDev);
                } else if (clickedDev.role === 'panelboard' || clickedDev.role === 'power_strip') {
                  setEditingPanel(clickedDev);
                } else {
                  setEditingDevice(clickedDev);
                }
              }
            } else {
              setTraceId(t => t === clickedId ? null : clickedId);
            }
          }
        }
      } else if (p.type === 'marquee' && p.worldStartX !== undefined && p.worldStartY !== undefined) {
        const marqueeRect = marqueeRef.current;
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
        drawMarquee(null);
      } else if (p.type === 'canvas') {
        if (p.moved) {
          commitView();
        } else if (!stateRef.current.editMode) {
          // 빈 공간 탭 (드래그 안 함) → 보기 모드면 trace 해제
          setTraceId(null);
        }
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    // 터치 이벤트: 핀치가 아닐 때(단일 터치)만 mouse로 매핑하여 팬/드래그/마키 동작
    const onTouchMove = (e: TouchEvent) => {
      if (pinchRef.current.active) return;
      if (e.touches.length !== 1) return;
      // 모달/UI 영역 안이면 도면 핸들링 무시 — 모달 자체 스크롤이 동작하도록
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-ui]')) return;
      const t = e.touches[0];
      // 캔버스 또는 장비 위 팬/드래그 중이면 기본 스크롤 방지
      if (pointerRef.current.type !== 'none') e.preventDefault();
      onMove({ clientX: t.clientX, clientY: t.clientY } as unknown as MouseEvent);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (pinchRef.current.active) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-ui]')) return;
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
    // 모든 값은 ref로 읽으므로 1회만 등록 (이전: 마키 사각형이 바뀔 때마다 리스너 재등록)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 휠 줌 — passive:false 네이티브 리스너 (React onWheel은 passive라 preventDefault가 안 먹음)
  useEffect(() => {
    const el = viewportElRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;          // 줄 단위 → px
      // 마우스 휠은 한 칸에 ~14%, 트랙패드 핀치(ctrlKey)는 미세하게 — 부드러운 연속 줌
      let factor = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015));
      factor = Math.min(1.25, Math.max(0.8, factor));
      const { s, o } = zoomAround(factor, e.clientX - r.left, e.clientY - r.top);
      applyView(s, o);
      scheduleCommitView();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ===== Canvas mousedown =====
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) return;                 // 우클릭은 무시
    const target = e.target as HTMLElement;
    if (target.closest('[data-device-id], [data-port], [data-ui]')) return;
    if (e.button === 1) e.preventDefault();     // 휠 클릭 드래그 = 팬 (자동 스크롤 방지)

    if (editMode && e.shiftKey && e.button === 0) {
      const w = screenToWorld(e.clientX, e.clientY);
      pointerRef.current = {
        type: 'marquee',
        downX: e.clientX, downY: e.clientY,
        shiftKey: true, moved: false,
        worldStartX: w.x, worldStartY: w.y,
      };
      document.body.classList.add('is-marquee');
      drawMarquee({ x: w.x, y: w.y, w: 0, h: 0 });
    } else {
      pointerRef.current = {
        type: 'canvas',
        downX: e.clientX, downY: e.clientY,
        shiftKey: e.shiftKey, moved: false,
        origOffset: { ...viewRef.current.offset },
      };
      document.body.classList.add('is-panning');
      // 편집모드에서 빈 공간 클릭은 다중선택 해제. 보기모드에서는 trace 유지.
      if (editMode && !e.shiftKey && selectedIds.size > 0) setSelectedIds(new Set());
    }
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
      // 진행 중이던 한 손가락 팬은 취소 (핀치로 전환)
      pointerRef.current = { type: 'none', downX: 0, downY: 0, shiftKey: false, moved: false };
      pinchRef.current = {
        active: true,
        startDist: dist,
        startScale: viewRef.current.scale,
        startMidX: midX, startMidY: midY,
        startOffset: { ...viewRef.current.offset },
      };
      worldElRef.current?.classList.add('is-zooming');
    } else if (e.touches.length === 1) {
      // 한 손가락 팬 - canvas mousedown처럼 처리 (synthesized MouseEvent로 재활용하지 않고 직접)
      const t = e.touches[0];
      pointerRef.current = {
        type: 'canvas',
        downX: t.clientX, downY: t.clientY,
        shiftKey: false, moved: false,
        origOffset: { ...viewRef.current.offset },
      };
      if (editMode && selectedIds.size > 0) setSelectedIds(new Set());
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
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchRef.current.startScale * factor));

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

      applyView(newScale, { x: mx - wx * newScale, y: my - wy * newScale });
      return;
    }
    // 단일 터치 팬은 window-level move가 처리함 (Touch → Mouse 에뮬레이션)
  };

  const onCanvasTouchEnd = () => {
    if (pinchRef.current.active) {
      pinchRef.current.active = false;
      commitView();
    }
  };

  // ===== Device mousedown =====
  const onDeviceMouseDown = (e: React.MouseEvent, d: Device) => {
    if (((e as any).button ?? 0) !== 0) return; // 좌클릭(또는 터치)만
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
    // 동일 장비 다시 클릭 → 트레이스 해제
    setTraceId(t => (t === d.id ? null : d.id));
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
        project_id: projectId,
      } as unknown as Connection;
      // 덮어쓸 기존 연결 스냅샷
      const isOverwritten = (c: Connection) => c.to_device === deviceId && c.to_port === port;
      const overwritten = connections.filter(isOverwritten);
      // 낙관적 반영 — DB 왕복 + 실시간 에코를 기다리지 않고 즉시 표시 (이전: 0.5~1초 지연)
      setConnections(prev => [...prev.filter(c => !isOverwritten(c)), newConn]);
      setPendingFrom(null);
      await (supabase as any).from('connections').delete().eq('to_device', deviceId).eq('to_port', port);
      const { error } = await (supabase as any).from('connections').insert(newConn);
      if (error) {
        console.error('[Connect error]', error);
        setConnections(prev => [...prev.filter(c => c.id !== newConn.id), ...overwritten]);
        alert(`케이블 저장 실패: ${error.message ?? error}`);
        return;
      }
      pushUndo('케이블 연결 되돌리기', async () => {
        setConnections(prev => [...prev.filter(c => c.id !== newConn.id), ...overwritten]);
        await (supabase as any).from('connections').delete().eq('id', newConn.id);
        if (overwritten.length > 0) {
          await (supabase as any).from('connections').insert(overwritten);
        }
      });
    }
  };

  // 포트 버튼 mousedown에서 stopPropagation — 포트 클릭이 장비 드래그로 이어지지 않도록
  const onPortMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // 장비 + 연결된 케이블 삭제 (로컬 즉시 반영 → DB)
  const removeDeviceAndConns = async (id: string) => {
    setDevices(prev => prev.filter(x => x.id !== id));
    setConnections(prev => prev.filter(c => c.from_device !== id && c.to_device !== id));
    await (supabase as any).from('connections').delete().or(`from_device.eq.${id},to_device.eq.${id}`);
    await (supabase as any).from('devices').delete().eq('id', id);
  };

  // 장비 insert — 로컬에 즉시 표시(낙관적)하고 DB 저장. 실패하면 되돌림.
  const insertDeviceSafe = async (d: Device): Promise<{ ok: boolean; err?: any }> => {
    setDevices(prev => [...prev.filter(x => x.id !== d.id), d]);
    const res = await insertDeviceRaw(d);
    if (!res.ok) {
      console.error('[DB insert error]', res.err);
      setDevices(prev => prev.filter(x => x.id !== d.id));
      alert(`장비 추가 실패: ${res.err?.message ?? JSON.stringify(res.err)}`);
    }
    return res;
  };

  // 장비 insert 시 CHECK 제약/컬럼 누락 자동 우회
  const insertDeviceRaw = async (d: Device): Promise<{ ok: boolean; err?: any }> => {
    const tryOnce = async (payload: any): Promise<any> => {
      const { error } = await (supabase as any).from('devices').insert(payload);
      if (!error) return { ok: true };
      const msg = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`;
      // CHECK constraint 위반 — type fallback
      if (/devices_type_check|violates check constraint/i.test(msg) && payload.type) {
        const fb = payload.type === 'power' ? 'audio' : payload.type === 'network' ? 'video' : null;
        if (fb && fb !== payload.type) {
          console.warn(`[DB insert] type='${payload.type}' → '${fb}' fallback`);
          return tryOnce({ ...payload, type: fb });
        }
      }
      // 컬럼 누락
      const match = msg.match(/['"]([A-Za-z_][A-Za-z0-9_]*)['"].*column/i) || msg.match(/column\s+['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/i);
      if (match && match[1] && payload[match[1]] !== undefined) {
        const col = match[1];
        const next = { ...payload };
        delete next[col];
        return tryOnce(next);
      }
      return { ok: false, err: error };
    };
    return tryOnce(d);
  };

  const handleAddDevice = async () => {
    const id = `dev_${Date.now().toString(36)}`;
    const defaultLayer = layers[0]?.id ?? 'layer_video';
    const d: Device = {
      id, name: '새 장비', type: 'video', role: 'standard',
      ...spawnPos(),
      width: 200, inputs: ['IN-1'], outputs: ['OUT-1'],
      inputsMeta: { 'IN-1': { name: 'IN-1', layerId: defaultLayer } },
      outputsMeta: { 'OUT-1': { name: 'OUT-1', layerId: defaultLayer } },
      physPorts: {}, routing: {},
      project_id: projectId,
    };
    setEditingDevice(d);
    await insertDeviceSafe(d);
    pushUndo('장비 추가 되돌리기', () => removeDeviceAndConns(id));

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
      ...spawnPos(),
      width: 340,
      inputs, outputs: [],
      inputsMeta, outputsMeta: {},
      multiviewLayout: 'pgm+pvw+6' as any,
      multiviewPgmInput: 'PGM',
      multiviewPvwInput: 'PVW',
      physPorts: {}, routing: {},
      project_id: projectId,
    };
    setEditingDevice(d);
    await insertDeviceSafe(d);
    pushUndo('멀티뷰 추가 되돌리기', () => removeDeviceAndConns(id));

  };

  // 오디오 콘솔 추가 — 기본: 16 IN / 8 OUT, 채널/버스 비어있음
  const handleAddAudioMixer = async () => {
    const id = `mxr_${Date.now().toString(36)}`;
    const audioLayer = layers.find(l => l.id === 'layer_audio')?.id ?? layers[0]?.id ?? 'layer_audio';
    const inputs = Array.from({ length: 16 }, (_, i) => `IN-${i + 1}`);
    const outputs = Array.from({ length: 8 }, (_, i) => `OUT-${i + 1}`);
    const inputsMeta: Record<string, any> = {};
    const outputsMeta: Record<string, any> = {};
    inputs.forEach(p => { inputsMeta[p] = { name: p, layerId: audioLayer, connType: 'XLR' }; });
    outputs.forEach(p => { outputsMeta[p] = { name: p, layerId: audioLayer, connType: 'XLR' }; });
    const d: Device = {
      id, name: '오디오 콘솔', type: 'audio', role: 'audio_mixer',
      ...spawnPos(),
      width: 280,
      inputs, outputs,
      inputsMeta, outputsMeta,
      audioChannels: [],
      audioBuses: [{ id: 'main', name: 'MAIN L/R', type: 'main', stereo: true, color: '#10B981' }],
      audioPatch: {},
      audioOutPatch: {},
      mixMatrix: {},
      physPorts: {}, routing: {},
      project_id: projectId,
    };
    setEditingMixer(d);
    await insertDeviceSafe(d);
    pushUndo('오디오 콘솔 추가 되돌리기', () => removeDeviceAndConns(id));

  };

  // I/O 박스 추가 — 종류 선택받아 생성
  const handleAddIoBox = async (kind: 'stagebox' | 'option_card') => {
    const id = `${kind === 'stagebox' ? 'sb' : 'oc'}_${Date.now().toString(36)}`;
    const audioLayer = layers.find(l => l.id === 'layer_audio')?.id ?? layers[0]?.id ?? 'layer_audio';
    // 기본: 16 IN / 8 OUT (XLR 단자)
    const inputs = Array.from({ length: 16 }, (_, i) => `IN-${i + 1}`);
    const outputs = Array.from({ length: 8 }, (_, i) => `OUT-${i + 1}`);
    const inputsMeta: Record<string, any> = {};
    const outputsMeta: Record<string, any> = {};
    inputs.forEach(p => { inputsMeta[p] = { name: p, layerId: audioLayer, connType: 'XLR' }; });
    outputs.forEach(p => { outputsMeta[p] = { name: p, layerId: audioLayer, connType: 'XLR' }; });
    const d: Device = {
      id,
      name: kind === 'stagebox' ? '스테이지박스' : '옵션카드',
      type: 'audio',
      role: 'io_box',
      ioBoxKind: kind,
      ioBoxProtocol: 'Dante',
      ...spawnPos(),
      width: 240,
      inputs, outputs,
      inputsMeta, outputsMeta,
      physPorts: {}, routing: {},
      project_id: projectId,
    };
    setEditingDevice(d);
    await insertDeviceSafe(d);
    pushUndo(`${kind === 'stagebox' ? '스테이지박스' : '옵션카드'} 추가 되돌리기`, () => removeDeviceAndConns(id));

  };

  // 배전반 추가
  const handleAddPanelboard = async () => {
    const id = `pnl_${Date.now().toString(36)}`;
    const powerLayer = layers.find(l => (l.name ?? '').toLowerCase().includes('power') || (l.name ?? '').includes('전력'))?.id ?? layers[0]?.id ?? 'layer_video';
    const d: Device = {
      id, name: '배전반', type: 'audio', role: 'panelboard',
      ...spawnPos(),
      width: 260,
      inputs: ['MAIN-IN'], outputs: [],
      inputsMeta: { 'MAIN-IN': { name: 'MAIN-IN', layerId: powerLayer, connType: 'POWER' as any, label: '메인 인입' } },
      outputsMeta: {},
      panelMainPhase: 'three',
      panelMainCapacity: 100,
      panelMainKind: 'MCCB',
      breakers: [],
      physPorts: {}, routing: {},
      project_id: projectId,
    };
    setEditingPanel(d);
    await insertDeviceSafe(d);
    pushUndo('배전반 추가 되돌리기', () => removeDeviceAndConns(id));

  };

  // 전력 공급 장비
  const handleAddPowerSupply = async () => {
    const id = `psu_${Date.now().toString(36)}`;
    const powerLayer = layers.find(l => (l.name ?? '').toLowerCase().includes('power') || (l.name ?? '').includes('전력'))?.id ?? layers[0]?.id ?? 'layer_video';
    const d: Device = {
      id, name: '전력 공급', type: 'audio', role: 'power_supply',
      ...spawnPos(),
      width: 200,
      inputs: [], outputs: ['OUT-1'],
      inputsMeta: {},
      outputsMeta: { 'OUT-1': { name: 'OUT-1', layerId: powerLayer, connType: 'POWER' as any } },
      power: { isSupply: true, phase: 'three', voltage: 380 },
      physPorts: {}, routing: {},
      project_id: projectId,
    };
    setEditingDevice(d);
    await insertDeviceSafe(d);
    pushUndo('전력 공급 추가 되돌리기', () => removeDeviceAndConns(id));

  };

  // 전력 소비 장비
  const handleAddPowerConsumer = async () => {
    const id = `pcs_${Date.now().toString(36)}`;
    const powerLayer = layers.find(l => (l.name ?? '').toLowerCase().includes('power') || (l.name ?? '').includes('전력'))?.id ?? layers[0]?.id ?? 'layer_video';
    const d: Device = {
      id, name: '전력 소비', type: 'audio', role: 'power_consumer',
      ...spawnPos(),
      width: 180,
      inputs: ['IN-1'], outputs: [],
      inputsMeta: { 'IN-1': { name: 'IN-1', layerId: powerLayer, connType: 'POWER' as any } },
      outputsMeta: {},
      power: { isSupply: false, phase: 'single', voltage: 220, watts: 100 },
      physPorts: {}, routing: {},
      project_id: projectId,
    };
    setEditingDevice(d);
    await insertDeviceSafe(d);
    pushUndo('전력 소비 추가 되돌리기', () => removeDeviceAndConns(id));

  };

  // 멀티탭 — 16A 인입, 사용자가 구 수 지정 (기본 8구)
  const handleAddPowerStrip = async () => {
    const input = prompt('멀티탭 구 수를 입력하세요 (1~32, 기본 8):', '8');
    if (input === null) return;  // 취소
    const portCount = Math.max(1, Math.min(32, parseInt(input) || 8));
    const id = `pst_${Date.now().toString(36)}`;
    const powerLayer = layers.find(l => (l.name ?? '').toLowerCase().includes('power') || (l.name ?? '').includes('전력'))?.id ?? layers[0]?.id ?? 'layer_video';
    const inputs = ['IN-1'];
    const outputs = Array.from({ length: portCount }, (_, i) => `OUT-${i + 1}`);
    const inputsMeta: Record<string, any> = {
      'IN-1': { name: 'IN-1', layerId: powerLayer, connType: 'POWER', label: '16A 인입' },
    };
    const outputsMeta: Record<string, any> = {};
    outputs.forEach((p, i) => {
      outputsMeta[p] = { name: p, layerId: powerLayer, connType: 'POWER', label: `${i + 1}구` };
    });
    const d: Device = {
      id,
      name: `멀티탭 ${portCount}구`,
      type: 'power',
      role: 'power_strip',
      ...spawnPos(),
      width: 240,
      inputs, outputs,
      inputsMeta, outputsMeta,
      panelMainPhase: 'single',
      panelMainCapacity: 16 as any,
      panelMainKind: 'MCCB',
      breakers: outputs.map((p, i) => ({
        id: `pst_br_${i}`,
        name: `${i + 1}구`,
        kind: 'MCCB' as const,
        phase: 'single' as const,
        capacityA: 16 as any,
        outputPort: p,
        color: '#FACC15',
      })),
      physPorts: {}, routing: {},
      project_id: projectId,
    };
    setEditingDevice(d);
    await insertDeviceSafe(d);
    pushUndo('멀티탭 추가 되돌리기', () => removeDeviceAndConns(id));

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
      groupId: undefined,
      groupName: undefined,
      inputs: [...src.inputs],
      outputs: [...src.outputs],
      inputsMeta: src.inputsMeta ? JSON.parse(JSON.stringify(src.inputsMeta)) : {},
      outputsMeta: src.outputsMeta ? JSON.parse(JSON.stringify(src.outputsMeta)) : {},
      physPorts: { ...src.physPorts },
      routing: { ...src.routing },
      normals: src.normals ? { ...src.normals } : undefined,
      project_id: projectId,
    };
    setEditingDevice(clone);
    await insertDeviceSafe(clone);
    pushUndo('복제 되돌리기', () => removeDeviceAndConns(id));
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
      const msg = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`;
      // CHECK constraint 위반 (구 DB) — type을 fallback 매핑하여 재시도
      if (/devices_type_check|violates check constraint/i.test(msg) && payload.type) {
        const fallbackType = payload.type === 'power' ? 'audio'
          : payload.type === 'network' ? 'video'
          : 'video';
        if (fallbackType !== payload.type) {
          console.warn(`[DB] devices.type='${payload.type}'이 DB CHECK 제약을 위반 — '${fallbackType}'로 fallback 저장. schema.sql을 실행하면 정상 저장됩니다.`);
          return trySave({ ...payload, type: fallbackType }, [...removed, `type=${payload.type}→${fallbackType}`]);
        }
      }
      // PostgREST 에러 메시지에서 누락된 컬럼명 추출
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
  // 삭제 되돌리기 — 로컬 즉시 복원 후 DB 재삽입
  const restoreDevicesAndConns = async (devs: Device[], conns: Connection[]) => {
    const dIds = new Set(devs.map(d => d.id));
    const cIds = new Set(conns.map(c => c.id));
    setDevices(prev => [...prev.filter(d => !dIds.has(d.id)), ...devs]);
    setConnections(prev => [...prev.filter(c => !cIds.has(c.id)), ...conns]);
    if (devs.length > 0) await (supabase as any).from('devices').insert(devs);
    if (conns.length > 0) await (supabase as any).from('connections').insert(conns);
  };
  const handleDeleteDevice = async () => {
    if (!editingDevice) return;
    const snapshot = { ...(devById.get(editingDevice.id) ?? editingDevice) };
    const relatedConns = connections.filter(c => c.from_device === snapshot.id || c.to_device === snapshot.id);
    setEditingDevice(null);
    await removeDeviceAndConns(snapshot.id);
    pushUndo(`"${snapshot.name}" 삭제 되돌리기`, () => restoreDevicesAndConns([snapshot], relatedConns));
  };
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}개 장비 삭제?`)) return;
    const ids = Array.from(selectedIds);
    const idSet = new Set(ids);
    const snapshotDevs = devices.filter(d => idSet.has(d.id));
    const snapshotConns = connections.filter(c => idSet.has(c.from_device) || idSet.has(c.to_device));
    // 로컬 즉시 반영 후 DB는 한 번에 (이전: 장비마다 2번씩 순차 요청)
    setDevices(prev => prev.filter(d => !idSet.has(d.id)));
    setConnections(prev => prev.filter(c => !idSet.has(c.from_device) && !idSet.has(c.to_device)));
    setSelectedIds(new Set());
    await Promise.all([
      (supabase as any).from('connections').delete().in('from_device', ids),
      (supabase as any).from('connections').delete().in('to_device', ids),
    ]);
    await (supabase as any).from('devices').delete().in('id', ids);
    pushUndo(`${ids.length}개 삭제 되돌리기`, () => restoreDevicesAndConns(snapshotDevs, snapshotConns));
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
    if (!confirm(`프로젝트 "${currentProject?.name ?? projectId}" 의 모든 데이터를 삭제하고 초기 상태로 되돌립니다. 계속하시겠어요?`)) return;
    // 현재 프로젝트 한정 삭제
    await (supabase as any).from('connections').delete().eq('project_id', projectId);
    await (supabase as any).from('devices').delete().eq('project_id', projectId);
    await (supabase as any).from('layers').delete().eq('project_id', projectId);
    // 기본 레이어 다시 생성
    const defaults = DEFAULT_LAYERS.map(l => ({ ...l, id: `${l.id}_${projectId}`, project_id: projectId }));
    await (supabase as any).from('layers').insert(defaults);
    setLayers(defaults as any);
    // default 프로젝트만 INITIAL_DEVICES 재시드
    if (projectId === 'default') {
      const seedDevs = INITIAL_DEVICES.map(d => ({ ...d, project_id: 'default' }));
      await (supabase as any).from('devices').insert(seedDevs);
      const conns = INITIAL_CONNECTIONS.map(c => ({ ...c, id: crypto.randomUUID(), project_id: 'default' }));
      await (supabase as any).from('connections').insert(conns);
      setDevices(seedDevs as any);
      setConnections(conns as any);
    } else {
      setDevices([]);
      setConnections([]);
    }
    undoStackRef.current = [];
    setUndoLabel(null);
  };

  // ===== 렌더 최적화: 데이터가 바뀔 때만 다시 만드는 SVG 오버레이 =====
  // (이전: 상태가 조금만 바뀌어도 매 렌더마다 전체 케이블 라벨/가상 케이블을 다시 계산)
  const labelLod = scale > 0.5 ? 3 : scale > 0.45 ? 2 : scale > 0.4 ? 1 : 0;

  // 편집/연결 모드 — 케이블 클릭 영역 + 연결방식/Tie-Line/PATCH 라벨
  const editCableOverlay = useMemo(() => {
    if (!editMode) return null;
    return connections.map(c => {
      if (!isConnVisible(c)) return null;
      if (c.from_device === c.to_device && c.is_patch) return null;
      // Trace 중이면 traced가 아닌 연결은 즉시 컷 — 렌더 작업 절약
      if (traceId && !traced.connections.has(c.id)) return null;
      const from = devById.get(c.from_device)!;
      const to = devById.get(c.to_device)!;
      const fromIsHub = from.role === 'router' || from.role === 'patchbay';
      const toIsHub = to.role === 'router' || to.role === 'patchbay';
      if (hidePatchbay && (fromIsHub || toIsHub)) return null;
      if (fromIsHub || toIsHub) {
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
      const midX = (x1 + x2) / 2;
      const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
      const isTraced = traced.connections.has(c.id);
      const ct = c.conn_type ?? from.outputsMeta?.[c.from_port]?.connType;
      const style = ct ? CONN_TYPE_STYLES[ct] : undefined;
      const fromLayerId = from.outputsMeta?.[c.from_port]?.layerId;
      const layerColor = fromLayerId ? layerById.get(fromLayerId)?.color : undefined;
      const typeColor = ct ? CONNECTION_TYPE_COLORS[ct as ConnectionType] : undefined;
      const color = typeColor ?? layerColor ?? (from.type === 'audio' ? TYPE_COLORS.audio.main : from.type === 'combined' ? TYPE_COLORS.combined.main : TYPE_COLORS.video.main);
      const isPgm = from.role === 'switcher' && from.pgmPort === c.from_port;
      const isPatch = c.is_patch === true;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const cableColor = isPatch ? '#F97316' : color;

      return (
        <g key={c.id} style={{ pointerEvents: 'none' }}>
          {/* 베이스 라인은 ConnectionCanvas가 담당 — SVG는 클릭 영역/라벨만 */}
          <path
            d={path} stroke="transparent" strokeWidth={18} fill="none"
            style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
            onClick={e => { e.stopPropagation(); setEditingCable(c); }}
          />
          {ct && (labelLod >= 3 || isTraced || isPgm || isPatch) && (
            <g>
              <rect x={mx - 24} y={my - 8.5} width="48" height="15" rx="4" fill="rgba(8,8,10,0.92)" stroke={cableColor} strokeWidth="0.6" />
              <text x={mx} y={my + 2.8} textAnchor="middle" fontSize="9.5" fill={cableColor} fontFamily="var(--font-mono)" fontWeight="700" letterSpacing="0.02em">
                {style?.label ?? ct}
              </text>
            </g>
          )}
          {c.tie_line && (labelLod >= 1 || isTraced) && (
            <g>
              <rect x={mx - 30} y={my + 8} width="60" height="12" rx="3" fill="rgba(20,15,5,0.92)" stroke="#F59E0B" strokeWidth="0.5" />
              <text x={mx} y={my + 17} textAnchor="middle" fontSize="8.5" fill="#FCD34D" fontFamily="var(--font-mono)" fontWeight="700">
                {c.tie_line}
              </text>
            </g>
          )}
          {isPatch && labelLod >= 2 && (
            <g>
              <rect x={mx - 22} y={my - 22} width="44" height="11" rx="2.5" fill="#F97316" opacity="0.95" />
              <text x={mx} y={my - 14} textAnchor="middle" fontSize="7.5" fill="white" fontFamily="var(--font-mono)" fontWeight="800" letterSpacing="0.05em">
                PATCH
              </text>
            </g>
          )}
        </g>
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, connections, devById, visibleDeviceIds, visibleLayerIds, traceId, traced, hidePatchbay, inspectHubs, visiblePortsCache, layerById, labelLod]);

  // 허브 숨김 모드 — 패치베이/라우터를 건너뛴 라벨-to-라벨 가상 케이블
  const virtualCablesEl = useMemo(() => {
    if (!hidePatchbay) return null;
    const LABEL_WIDTH = 130;
    const LABEL_PAD = 6;
    const vcs: Array<{
      id: string;
      fromDev: Device; fromPortIdx: number;
      toDev: Device; toPortIdx: number;
      color: string;
      isTraced: boolean;
    }> = [];

    devices.forEach(d => {
      if (d.role === 'patchbay' || d.role === 'router') return;
      if (!visibleDeviceIds.has(d.id)) return;
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
        if (traceId && !isVcTraced) return;
        const lid = d.outputsMeta?.[p.name]?.layerId;
        const layerColor = lid ? layerById.get(lid)?.color : undefined;
        const clr = layerColor ?? (d.type === 'audio' ? TYPE_COLORS.audio.main : d.type === 'combined' ? TYPE_COLORS.combined.main : TYPE_COLORS.video.main);
        vcs.push({
          id: `vc_${d.id}_${p.name}`,
          fromDev: d, fromPortIdx: idx,
          toDev: followed.finalDev, toPortIdx: toIdx,
          color: clr, isTraced: isVcTraced,
        });
      });
    });

    return (
      <g style={{ pointerEvents: 'none' }}>
        {vcs.map(vc => {
          // OUT 라벨 박스 오른쪽 끝점 → IN 라벨 박스 왼쪽 끝점
          const x1 = vc.fromDev.x + deviceWidth(vc.fromDev) + 6 + LABEL_WIDTH + LABEL_PAD;
          const y1 = vc.fromDev.y + HEADER_H + PADDING_Y + vc.fromPortIdx * PORT_H + PORT_H / 2;
          const x2 = vc.toDev.x - 6 - LABEL_WIDTH - LABEL_PAD;
          const y2 = vc.toDev.y + HEADER_H + PADDING_Y + vc.toPortIdx * PORT_H + PORT_H / 2;
          const midX = (x1 + x2) / 2;
          const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
          return (
            <g key={vc.id}>
              {vc.isTraced && (
                <path d={path} stroke={vc.color} strokeWidth={7} fill="none" opacity={0.4} filter="url(#glow-strong)" />
              )}
              <path d={path}
                    stroke={vc.color}
                    strokeWidth={vc.isTraced ? 2.8 : 1.6}
                    strokeDasharray={vc.isTraced ? '6 12' : '2 4'}
                    fill="none"
                    opacity={vc.isTraced ? 1 : 0.5}
                    filter={vc.isTraced ? 'url(#glow)' : undefined}
                    className={vc.isTraced ? 'flow-line' : ''}
                    style={vc.isTraced ? { animationDuration: '1.2s' } : undefined}
              />
            </g>
          );
        })}
      </g>
    );
  }, [hidePatchbay, devices, visibleDeviceIds, visiblePortsCache, followPathFromOut, traceId, traced, layerById]);

  // ===== 화면 맞춤 (전체 보기) =====
  const fitToContent = (opts?: { minScale?: number; maxScale?: number }) => {
    const vw = viewportElRef.current?.clientWidth ?? viewport.w;
    const vh = viewportElRef.current?.clientHeight ?? (viewport.h - TOPBAR_H);
    const vis = devices.filter(d =>
      visibleDeviceIds.has(d.id) && !(hidePatchbay && (d.role === 'patchbay' || d.role === 'router')));
    if (vis.length === 0 || vw <= 0 || vh <= 0) { setView(0.7, { x: 40, y: 40 }); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    vis.forEach(d => {
      const w = iconMode ? 96 : deviceWidth(d);
      const h = iconMode ? 36 : deviceHeight(d, visibleLayerIds);
      minX = Math.min(minX, d.x); minY = Math.min(minY, d.y);
      maxX = Math.max(maxX, d.x + w); maxY = Math.max(maxY, d.y + h);
    });
    // 카드 좌우의 IN/OUT 라벨(약 160px)과 여백 포함
    minX -= iconMode ? 24 : 170; maxX += iconMode ? 24 : 150;
    minY -= 24; maxY += 24;
    const bw = maxX - minX, bh = maxY - minY;
    const s = Math.min(opts?.maxScale ?? 1, Math.max(opts?.minScale ?? MIN_SCALE, Math.min(vw / bw, vh / bh)));
    setView(s, { x: (vw - bw * s) / 2 - minX * s, y: (vh - bh * s) / 2 - minY * s });
  };
  fitRef.current = () => fitToContent();

  // 처음 열면 도면 전체가 보이도록 자동 맞춤 (최대 100%)
  const didAutoFitRef = useRef(false);
  useEffect(() => { didAutoFitRef.current = false; }, [projectId]);
  useEffect(() => {
    if (loading || didAutoFitRef.current) return;
    didAutoFitRef.current = true;
    fitToContent({ maxScale: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, projectId]);

  // 모달이 열려 있으면 Esc/F 단축키는 도면에 적용하지 않음
  stateRef.current.modalOpen = !!(editingDevice || editingMixer || editingPanel || editingCable
    || showPatchbayMgr || showWallboxMgr || showBulkEditor || showProjectSettings);

  if (loading) {
    return (
      <div className="h-screen bg-neutral-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-neutral-400 text-sm">
          <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          불러오는 중…
        </div>
      </div>
    );
  }

  // ===== 렌더용 파생 값 =====
  // 뷰포트 컬링 영역(world 좌표) — 화면의 60%만큼 여유를 둬서 팬 도중 빈 곳이 보이지 않게
  const cullMX = Math.max(320, viewport.w * 0.6);
  const cullMY = Math.max(320, viewport.h * 0.6);
  const cull = {
    l: (-offset.x - cullMX) / scale,
    t: (-offset.y - cullMY) / scale,
    r: (viewport.w - offset.x + cullMX) / scale,
    b: (viewport.h - TOPBAR_H - offset.y + cullMY) / scale,
  };
  const hubDevices = devices.filter(d => d.role === 'router' || d.role === 'patchbay');
  const allHubsInspected = hubDevices.length > 0 && hubDevices.every(h => inspectHubs.has(h.id));
  const patchbayCount = devices.filter(d => d.role === 'patchbay').length;
  const wallboxCount = devices.filter(d => d.role === 'wallbox').length;
  const activeSources = devices.filter(d => d.role === 'source' && (d.imageUrl || d.audioUrl)).length;
  const hasDisplays = devices.some(d => d.role === 'display');
  const visibleLayerCount = layers.filter(l => l.visible).length;
  const traceDev = traceId ? devById.get(traceId) : undefined;
  const powerRoles = ['panelboard', 'power_supply', 'power_consumer', 'power_strip'].filter(r => isRoleEnabled(r));

  const switchMode = (m: ViewMode) => {
    if (m === 'view') { setViewMode('view'); setPendingFrom(null); setSelectedIds(new Set()); }
    else if (m === 'connect') { setViewMode('connect'); setTraceId(null); setSelectedIds(new Set()); }
    else { setViewMode('edit'); setTraceId(null); }
  };
  const toggleAllHubLines = () => {
    if (allHubsInspected) setInspectHubs(new Set());
    else setInspectHubs(new Set(hubDevices.map(h => h.id)));
  };
  const toggleBgLock = async () => {
    if (!currentProject) return;
    const newLocked = !(currentProject.background_locked ?? false);
    setCurrentProject({ ...currentProject, background_locked: newLocked });
    await (supabase as any).from('projects').update({ background_locked: newLocked }).eq('id', currentProject.id);
  };
  const ALIGN_ACTIONS: Array<{ kind: AlignType; title: string; icon: ReactNode; min3?: boolean }> = [
    { kind: 'left',     title: '왼쪽 정렬',   icon: <AlignStartVertical size={15} /> },
    { kind: 'center-x', title: '가로 중앙',   icon: <AlignCenterVertical size={15} /> },
    { kind: 'right',    title: '오른쪽 정렬', icon: <AlignEndVertical size={15} /> },
    { kind: 'top',      title: '위쪽 정렬',   icon: <AlignStartHorizontal size={15} /> },
    { kind: 'center-y', title: '세로 중앙',   icon: <AlignCenterHorizontal size={15} /> },
    { kind: 'bottom',   title: '아래쪽 정렬', icon: <AlignEndHorizontal size={15} /> },
    { kind: 'dist-x',   title: '가로 균등 분배', icon: <AlignHorizontalDistributeCenter size={15} />, min3: true },
    { kind: 'dist-y',   title: '세로 균등 분배', icon: <AlignVerticalDistributeCenter size={15} />, min3: true },
  ];
  const MODES: Array<{ id: ViewMode; label: string; icon: ReactNode; title: string; on: string }> = [
    { id: 'view',    label: '보기', icon: <Eye size={14} />,    title: '보기 — 장비를 클릭하면 신호 경로를 추적합니다', on: 'bg-white/15 text-white' },
    { id: 'connect', label: '연결', icon: <Cable size={14} />,  title: '연결 — 출력 포트 → 입력 포트 순서로 클릭해 케이블 연결', on: 'bg-sky-500 text-white' },
    { id: 'edit',    label: '편집', icon: <Pencil size={14} />, title: '편집 — 장비 추가·이동·수정', on: 'bg-amber-500 text-neutral-950' },
  ];
  const ICON_BTN = 'h-8 w-8 inline-flex items-center justify-center rounded-md text-neutral-300 hover:text-white hover:bg-white/10 shrink-0';
  const showSelectionBar = editMode && selectedIds.size > 0;

  return (
    <div className="h-screen w-screen bg-neutral-950 text-white overflow-hidden relative select-none">
      {/* ===== 상단 바 — 1줄: [목록·프로젝트] [모드] [추가·되돌리기] ··· [레이어·표시·관리] [상태] ===== */}
      <div data-ui className="absolute top-0 left-0 right-0 z-30 flex items-center gap-1 px-2 bg-neutral-950 border-b border-white/10" style={{ height: TOPBAR_H }}>
        <a href="/" className={ICON_BTN} title="프로젝트 목록"><ArrowLeft size={16} /></a>
        <button
          type="button"
          onClick={() => setShowProjectSettings(true)}
          className="h-9 flex items-center gap-2 pl-1 pr-2 rounded-md hover:bg-white/10 min-w-0 shrink"
          title="프로젝트 설정 (이름·색·배경 이미지·사용할 장비 역할·용어)"
        >
          <span
            className="w-7 h-7 rounded-md flex items-center justify-center text-[15px] shrink-0"
            style={{ background: currentProject?.thumbnail_color ?? '#334155' }}
          >{currentProject?.icon ?? '📡'}</span>
          <span className="hidden sm:block min-w-0 max-w-[200px] text-left">
            <span className="block text-[13px] font-semibold truncate leading-tight">{currentProject?.name ?? 'Signal Flow Map'}</span>
            {currentProject?.description && (
              <span className="block text-[10.5px] text-neutral-500 truncate leading-tight">{currentProject.description}</span>
            )}
          </span>
          <Settings2 size={14} className="hidden md:block text-neutral-500 shrink-0" />
        </button>

        <div className="w-px h-6 bg-white/10 mx-1 shrink-0" />

        {/* 모드 */}
        <div className="flex items-center gap-0.5 bg-white/[0.06] rounded-lg p-0.5 shrink-0">
          {MODES.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => switchMode(m.id)}
              title={m.title}
              className={`h-7 px-2 sm:px-2.5 inline-flex items-center gap-1.5 rounded-md text-[12px] font-medium transition-colors ${viewMode === m.id ? m.on : 'text-neutral-400 hover:text-white'}`}
            >
              {m.icon}<span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>

        {/* 편집 모드: 추가 메뉴 + 되돌리기 */}
        {editMode && (
          <Dropdown
            label={<><Plus size={15} /><span className="hidden sm:inline">추가</span></>}
            title="장비 추가"
            buttonClassName="ml-1 !bg-sky-600 hover:!bg-sky-500 !text-white"
          >
            {close => (
              <>
                <MenuLabel>기본</MenuLabel>
                <MenuItem icon={<Box size={15} />} label="장비" hint="일반" onClick={() => { close(); handleAddDevice(); }} />
                {isRoleEnabled('multiview') && (
                  <MenuItem icon={<LayoutGrid size={15} />} label={t('멀티뷰')} hint="PGM/PVW" onClick={() => { close(); handleAddMultiview(); }} />
                )}
                {(isRoleEnabled('audio_mixer') || isRoleEnabled('io_box')) && <MenuLabel>음향</MenuLabel>}
                {isRoleEnabled('audio_mixer') && (
                  <MenuItem icon={<SlidersVertical size={15} />} label={t('콘솔')} hint="16 IN / 8 OUT" onClick={() => { close(); handleAddAudioMixer(); }} />
                )}
                {isRoleEnabled('io_box') && (
                  <>
                    <MenuItem icon={<Server size={15} />} label={t('스테이지박스')} hint="랜선 확장" onClick={() => { close(); handleAddIoBox('stagebox'); }} />
                    <MenuItem icon={<CreditCard size={15} />} label={t('옵션카드')} hint="슬롯 내장" onClick={() => { close(); handleAddIoBox('option_card'); }} />
                  </>
                )}
                {powerRoles.length > 0 && <MenuLabel>전력</MenuLabel>}
                {isRoleEnabled('panelboard') && (
                  <MenuItem icon={<Zap size={15} />} label={t('배전반')} onClick={() => { close(); handleAddPanelboard(); }} />
                )}
                {isRoleEnabled('power_supply') && (
                  <MenuItem icon={<PlugZap size={15} />} label={t('공급')} hint="전력 공급" onClick={() => { close(); handleAddPowerSupply(); }} />
                )}
                {isRoleEnabled('power_consumer') && (
                  <MenuItem icon={<Lightbulb size={15} />} label={t('소비')} hint="전력 소비" onClick={() => { close(); handleAddPowerConsumer(); }} />
                )}
                {isRoleEnabled('power_strip') && (
                  <MenuItem icon={<Plug size={15} />} label={t('멀티탭')} hint="16A" onClick={() => { close(); handleAddPowerStrip(); }} />
                )}
              </>
            )}
          </Dropdown>
        )}
        {editMode && undoLabel && (
          <TbButton onClick={() => popUndo()} title={`되돌리기: ${undoLabel} (Ctrl+Z)`}>
            <Undo2 size={15} />
            <span className="hidden lg:inline max-w-[160px] truncate">{undoLabel}</span>
          </TbButton>
        )}

        <div className="flex-1 min-w-0" />

        {/* 오른쪽: 보기 옵션 */}
        <TbButton active={showLayerPanel} onClick={() => setShowLayerPanel(s => !s)} title="레이어 표시/관리">
          <Layers size={15} />
          <span className="hidden md:inline">레이어</span>
          <span className="hidden sm:inline font-mono text-[11px] text-neutral-500">{visibleLayerCount}/{layers.length}</span>
        </TbButton>
        <Dropdown align="right" label={<><SlidersHorizontal size={15} /><span className="hidden md:inline">표시</span></>} title="표시 옵션">
          {() => (
            <>
              <MenuItem icon={<Square size={14} />} label="아이콘 모드 (카드 축소)" checked={iconMode} onClick={() => setIconMode(m => !m)} />
              {hubDevices.length > 0 && (
                <>
                  <MenuItem icon={<Route size={15} />} label="허브(패치베이·라우터) 숨기기" checked={hidePatchbay} onClick={() => setHidePatchbay(v => !v)} />
                  <MenuItem icon={<Spline size={15} />} label="허브 연결선 모두 표시" checked={allHubsInspected} onClick={toggleAllHubLines} />
                </>
              )}
              <MenuItem icon={<Palette size={15} />} label="범례" checked={showLegend} onClick={() => setShowLegend(s => !s)} />
              {currentProject?.background_image_url && (
                <MenuItem
                  icon={currentProject.background_locked ? <Lock size={14} /> : <Unlock size={14} />}
                  label="배경 이미지 잠금"
                  checked={!!currentProject.background_locked}
                  onClick={toggleBgLock}
                />
              )}
            </>
          )}
        </Dropdown>
        <Dropdown align="right" label={<><Wrench size={15} /><span className="hidden md:inline">관리</span></>} title="관리 도구">
          {close => (
            <>
              <MenuItem icon={<PanelsTopLeft size={15} />} label="패치베이 관리" hint={patchbayCount} onClick={() => { close(); setShowPatchbayMgr(true); }} />
              <MenuItem icon={<LayoutGrid size={15} />} label="월박스 관리" hint={wallboxCount} onClick={() => { close(); setShowWallboxMgr(true); }} />
              <MenuItem icon={<Settings2 size={15} />} label="프로젝트 설정" onClick={() => { close(); setShowProjectSettings(true); }} />
              {editMode && (
                <>
                  <MenuDivider />
                  <MenuItem danger icon={<RotateCcw size={15} />} label="프로젝트 초기화 (전체 삭제)" onClick={() => { close(); handleResetAll(); }} />
                </>
              )}
            </>
          )}
        </Dropdown>

        {/* 상태: 신호 시뮬레이션 · 장비/케이블 수 · 접속자 */}
        <div
          className="hidden md:flex items-center gap-2.5 pl-2.5 ml-1 border-l border-white/10 text-[11px] font-mono text-neutral-500 shrink-0"
          title={`장비 ${devices.length} · 케이블 ${connections.length} · 접속 ${online}명`}
        >
          {(activeSources > 0 || hasDisplays) && (
            <span className="text-lime-400/90" title="신호 시뮬레이션: 활성 소스 → 신호가 도달한 디스플레이">
              ▶{activeSources}→{displaySources.size}
            </span>
          )}
          <span>{devices.length}D·{connections.length}C</span>
          <span className="flex items-center gap-1 text-emerald-400"><Users size={12} />{online}</span>
        </div>
      </div>

      {showLayerPanel && <LayerPanel layers={layers} onClose={() => setShowLayerPanel(false)} />}

      {/* 신호 추적 상태 (보기 모드) */}
      {!editMode && traceDev && (
        <div data-ui className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 pl-3 pr-1 h-9 rounded-full bg-sky-950/90 border border-sky-500/40 shadow-lg text-[12px] whitespace-nowrap max-w-[calc(100vw-24px)]">
          <Crosshair size={14} className="text-sky-300 shrink-0" />
          <span className="text-sky-100 truncate">신호 추적 · <span className="font-semibold">{traceDev.name}</span></span>
          <span className="text-sky-300/70 font-mono text-[11px] shrink-0">{traced.devices.size}대 · {traced.connections.size}선</span>
          <button type="button" onClick={() => setTraceId(null)} className="h-7 w-7 inline-flex items-center justify-center rounded-full text-sky-200 hover:bg-white/10 shrink-0" title="추적 해제 (Esc)">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 케이블 연결 대기 */}
      {pendingFrom && (
        <div data-ui className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 pl-3 pr-1 h-9 rounded-full bg-amber-950/90 border border-amber-500/40 shadow-lg text-[12px] whitespace-nowrap max-w-[calc(100vw-24px)]">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <span className="text-amber-100 truncate">
            <span className="font-mono">{devById.get(pendingFrom.device)?.name} · {pendingFrom.port}</span>
            <span className="text-amber-300/80 ml-2">→ 연결할 입력 포트를 클릭</span>
          </span>
          <button type="button" onClick={() => setPendingFrom(null)} className="h-7 px-2.5 rounded-full text-amber-200 hover:bg-white/10 text-[11.5px] shrink-0" title="취소 (Esc)">취소</button>
        </div>
      )}

      {/* 범례 */}
      {showLegend && (
        <div data-ui className="absolute bottom-[68px] right-4 z-20 w-[250px] rounded-xl border border-white/10 bg-neutral-900 shadow-2xl shadow-black/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[12px] font-semibold text-neutral-200 flex items-center gap-1.5"><Palette size={13} /> 범례</div>
            <button type="button" onClick={() => setShowLegend(false)} className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-white/10 text-neutral-400" title="닫기"><X size={13} /></button>
          </div>
          <div className="text-[10.5px] text-neutral-500 mb-1">장비 타입</div>
          <div className="flex gap-3 mb-2.5 text-[11px] text-neutral-300">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500" />Video</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />Audio</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-purple-500" />V+A</span>
          </div>
          <div className="text-[10.5px] text-neutral-500 mb-1">케이블</div>
          <div className="space-y-0.5">
            {LEGEND_LINES.map(l => (
              <div key={l.name} className="flex items-center gap-2 py-0.5">
                <svg width="32" height="10" className="shrink-0">
                  <line x1="0" y1="5" x2="32" y2="5" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} />
                </svg>
                <span className="text-[11px] font-mono font-semibold text-neutral-200 w-14">{l.name}</span>
                <span className="text-[10.5px] text-neutral-500">{l.desc}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-neutral-500 leading-relaxed">
            포트·케이블의 <span className="text-neutral-300">연결 타입</span>을 지정하면 해당 색·패턴으로 표시됩니다.
          </div>
        </div>
      )}

      {/* 모드별 조작 안내 (한 줄) */}
      {!showSelectionBar && (
        <div className="hidden md:block absolute bottom-4 left-4 z-20 h-9 leading-9 px-3 rounded-lg bg-neutral-900/90 border border-white/10 text-[11.5px] text-neutral-400 pointer-events-none truncate max-w-[calc(100vw-260px)]">
          {viewMode === 'view' && '장비 클릭: 신호 추적 · 스위처 OUT 클릭: PGM 지정 · 라우터 OUT 클릭: 입력 전환 · 드래그: 화면 이동 · 휠: 확대/축소 · F: 전체 보기'}
          {viewMode === 'connect' && '출력 포트(오른쪽 ●) → 입력 포트(왼쪽 ●) 순서로 클릭하면 케이블이 연결됩니다 · 케이블 클릭: 속성 · Esc: 취소'}
          {viewMode === 'edit' && '장비 클릭: 편집 · 드래그: 이동 · Shift+클릭: 다중 선택 · Shift+드래그: 영역 선택 · 케이블 클릭: 속성 · Ctrl+Z: 되돌리기'}
        </div>
      )}

      {/* 선택 도구 (편집 모드에서 장비 선택 시) */}
      {showSelectionBar && (
        <div data-ui className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 p-1 rounded-xl bg-neutral-900 border border-white/10 shadow-2xl shadow-black/60 max-w-[calc(100vw-24px)] overflow-x-auto">
          <span className="px-2 text-[12px] text-amber-300 font-semibold whitespace-nowrap">{selectedIds.size}개 선택</span>
          {selectedGroupInfo && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-fuchsia-500/15 text-fuchsia-200 whitespace-nowrap mr-1">⬢ {selectedGroupInfo.name}</span>
          )}
          <BarSep />
          <TbButton onClick={() => setShowBulkEditor(true)} title="선택한 장비에 공통 값 일괄 적용"><Pencil size={14} />일괄편집</TbButton>
          {selectedIds.size >= 2 && !selectedGroupInfo && (
            <TbButton onClick={handleGroupSelected} title="선택한 장비를 하나의 그룹으로 묶기"><Group size={14} />그룹</TbButton>
          )}
          {selectedGroupInfo && (
            <>
              <TbButton onClick={handleGroupSelected} title="그룹 이름 변경">이름 변경</TbButton>
              <TbButton onClick={handleUngroupSelected} title="그룹 해제"><Ungroup size={14} />해제</TbButton>
            </>
          )}
          {selectedIds.size >= 2 && (
            <>
              <BarSep />
              {ALIGN_ACTIONS.filter(a => !a.min3 || selectedIds.size >= 3).map(a => (
                <button key={a.kind} type="button" onClick={() => handleAlign(a.kind)} title={a.title} className={ICON_BTN}>{a.icon}</button>
              ))}
            </>
          )}
          <BarSep />
          <TbButton onClick={handleDeleteSelected} title="선택한 장비 삭제" className="!text-rose-300 hover:!bg-rose-500/20"><Trash2 size={14} />삭제</TbButton>
          <button type="button" onClick={() => setSelectedIds(new Set())} title="선택 해제 (Esc)" className={ICON_BTN}><X size={14} /></button>
        </div>
      )}

      {/* 줌 */}
      <div data-ui className="absolute bottom-4 right-4 z-20 flex items-center gap-0.5 p-1 rounded-xl bg-neutral-900 border border-white/10 shadow-lg">
        <button type="button" onClick={() => zoomBy(1 / 1.2)} title="축소" className={ICON_BTN}><Minus size={15} /></button>
        <button
          type="button"
          ref={zoomLabelRef}
          onClick={() => zoomBy(1 / viewRef.current.scale)}
          title="100%로 보기"
          className="h-8 w-12 rounded-md text-[11px] font-mono text-neutral-400 hover:text-white hover:bg-white/10"
        >{`${Math.round(scale * 100)}%`}</button>
        <button type="button" onClick={() => zoomBy(1.2)} title="확대" className={ICON_BTN}><Plus size={15} /></button>
        <div className="w-px h-5 bg-white/10 mx-0.5" />
        <button type="button" onClick={() => fitToContent()} title="전체 보기 (F)" className={ICON_BTN}><Maximize size={15} /></button>
      </div>

      {/* ===== 도면 캔버스 ===== */}
      <div
        ref={viewportElRef}
        data-canvas
        className="absolute inset-x-0 bottom-0 overflow-hidden cursor-grab"
        onMouseDown={onCanvasMouseDown}
        onTouchStart={onCanvasTouchStart}
        onTouchMove={onCanvasTouchMove}
        onTouchEnd={onCanvasTouchEnd}
        style={{
          top: TOPBAR_H,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: `${24 * scale}px ${24 * scale}px`,
          backgroundPosition: `${offset.x}px ${offset.y}px`,
          touchAction: 'none',                        // 브라우저 기본 팬/줌 차단 → 우리가 처리
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        {/* Connection Canvas — 도면과 같은 좌표계 */}
        <div className="absolute inset-0 pointer-events-none">
          <ConnectionCanvas
            ref={connectionCanvasRef}
            width={viewport.w}
            height={Math.max(1, viewport.h - TOPBAR_H)}
            scale={scale}
            offsetX={offset.x}
            offsetY={offset.y}
            cables={canvasCables}
          />
        </div>

        <div ref={worldElRef} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: '0 0', width: '4000px', height: '3000px', position: 'relative' }}>
          {/* 배경 이미지 — 도면 위에 깔리는 참조 이미지 */}
          {currentProject?.background_image_url && (
            <BackgroundImageLayer
              src={currentProject.background_image_url}
              opacity={currentProject.background_opacity ?? 50}
              x={bgImgX}
              y={bgImgY}
              width={bgImgWidth || (bgImgNaturalSize?.w ?? 600)}
              height={bgImgHeight || (bgImgNaturalSize?.h ?? 400)}
              locked={currentProject.background_locked ?? false}
              keepAspectRatio={bgKeepAspect}
              onTransform={(next) => {
                setBgImgX(next.x);
                setBgImgY(next.y);
                setBgImgWidth(next.width);
                setBgImgHeight(next.height);
              }}
              onCommit={async () => {
                if (!currentProject) return;
                await (supabase as any).from('projects').update({
                  background_x: bgImgX,
                  background_y: bgImgY,
                  background_width: bgImgWidth,
                  background_height: bgImgHeight,
                }).eq('id', currentProject.id);
                setCurrentProject({
                  ...currentProject,
                  background_x: bgImgX,
                  background_y: bgImgY,
                  background_width: bgImgWidth,
                  background_height: bgImgHeight,
                });
              }}
              onNaturalSize={(size) => {
                setBgImgNaturalSize(size);
                // 처음 로드 시 width/height가 없으면 자연 크기로 초기화
                if (size && (!bgImgWidth || !bgImgHeight)) {
                  // legacy: scale이 있으면 적용
                  const legacyScale = currentProject?.background_scale;
                  if (typeof legacyScale === 'number' && legacyScale > 0 && legacyScale !== 1) {
                    setBgImgWidth(size.w * legacyScale);
                    setBgImgHeight(size.h * legacyScale);
                  } else {
                    setBgImgWidth(size.w);
                    setBgImgHeight(size.h);
                  }
                }
              }}
            />
          )}

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

            {/* 편집/연결 모드 케이블 클릭 영역 + 라벨 (useMemo) */}
            {editCableOverlay}

            {/* 허브 숨김 모드 가상 케이블 (useMemo) */}
            {virtualCablesEl}

            {/* 마키(영역 선택) — DOM 직접 갱신 */}
            <rect ref={marqueeElRef} display="none" fill="rgba(59,130,246,0.08)" stroke="rgba(59,130,246,0.8)" strokeWidth="1.5" strokeDasharray="5 3" rx="4" />
          </svg>

          {/* Devices */}
          {devices.map(d => {
            if (!isDeviceVisible(d)) return null;
            if (hidePatchbay && (d.role === 'patchbay' || d.role === 'router')) return null;
            if (traceId && !traced.devices.has(d.id)) return null;
            // 뷰포트 컬링 — 화면 밖 장비 skip (카드 좌우 라벨 폭 포함)
            const w = deviceWidth(d);
            const h = deviceHeight(d, visibleLayerIds);
            if (d.x + w + 170 < cull.l || d.x - 170 > cull.r) return null;
            if (d.y + h < cull.t || d.y > cull.b) return null;

            const color = TYPE_COLORS[d.type] ?? TYPE_COLORS.video;
            const isSelected = selectedIds.has(d.id);
            const isTraceTarget = traceId === d.id;
            const vpCached = visiblePortsCache.get(d.id);
            const inVis = vpCached?.in ?? [];
            const outVis = vpCached?.out ?? [];
            const role = d.role ?? 'standard';
            const roleStyle = ROLE_STYLE[role];
            const isPatchbay = role === 'patchbay';
            const isWallbox = role === 'wallbox';
            const isSource = role === 'source';
            const isDisplay = role === 'display';
            const isMultiview = role === 'multiview';
            const isAudioMixer = role === 'audio_mixer';
            const isIoBox = role === 'io_box';
            const isPanelboard = role === 'panelboard';
            const isPowerSupply = role === 'power_supply';
            const isPowerConsumer = role === 'power_consumer';
            const isPowerStrip = role === 'power_strip';
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
                data-icon-mode={iconMode ? '1' : '0'}
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
                  // 아이콘 모드: 가로 96px, 세로 자동 (헤더만)
                  const useBaseW = iconMode ? 96 : w;
                  const useBaseH = iconMode ? 36 : h;
                  const finalTransform = '';

                  const isRouterRole = role === 'router';

                  return {
                    left: d.x, top: d.y,
                    width: useBaseW,
                    minHeight: useBaseH,
                    ...(iconMode ? { maxHeight: useBaseH, height: useBaseH } : {}),
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
                    // 그림자는 선택/추적 대상에만 — 카드 수십 개의 그림자 페인트 비용 절감
                    boxShadow: isSelected
                      ? `0 0 0 2px rgba(251,191,36,0.6)`
                      : isTraceTarget
                      ? `0 0 0 2px ${color.glow}aa`
                      : undefined,
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
                    style={{ background: `linear-gradient(180deg, ${color.glow}, ${color.main})` }}
                  ></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <div className="text-[14px] font-semibold truncate text-white leading-snug tracking-tight">{d.name}</div>
                      {roleStyle && (
                        <span
                          className="text-[9px] px-1 py-[1px] rounded shrink-0 font-mono font-bold"
                          style={{ background: roleStyle.bg, color: roleStyle.fg, border: `0.5px solid ${roleStyle.bd}` }}
                          title={DEVICE_ROLE_LABELS[role]}
                        >{roleStyle.icon} {DEVICE_ROLE_LABELS[role]}</span>
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
                            className={`relative -ml-[12px] hover:scale-110 active:scale-95 transition-transform shrink-0 flex items-center justify-center`}
                            style={{ width: 24, height: 24, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer' }}
                            title={meta?.label ?? p.name}
                          >
                            <span
                              className={`block rounded-full ring-2 ${isSel && canSelect ? 'ring-cyan-300/70' : 'ring-black/40'}`}
                              style={{
                                width: 12, height: 12,
                                background: isSel && canSelect ? '#22d3ee' : portColor,
                                boxShadow: isSel && canSelect ? '0 0 10px #22d3ee' : undefined,
                              }}
                            ></span>
                          </button>
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
                                style={{ background: `${portColor}20`, color: portColor, border: `0.5px solid ${portColor}55` }}>
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
                                {t('PGM')}
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
                                style={{ background: `${portColor}20`, color: portColor, border: `0.5px solid ${portColor}55` }}>
                                {ctStyle?.label ?? ct}
                              </span>
                            )}
                            <span className="text-[11.5px] text-neutral-200 font-mono truncate font-medium">{p.name}</span>
                          </div>
                          <button
                            data-port
                            onMouseDown={onPortMouseDown}
                            onClick={e => onPortClick(e, d.id, p.name, true)}
                            className={`relative -mr-[12px] hover:scale-110 active:scale-95 transition-transform shrink-0 flex items-center justify-center ${isPending ? 'animate-pulse' : ''}`}
                            style={{ width: 24, height: 24, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer' }}
                            title={isPgm ? `${p.name} (PGM)` : (meta?.label ?? p.name)}
                          >
                            <span
                              className={`block rounded-full ring-2 ${isPending ? 'ring-amber-300/60' : isPgm ? 'ring-emerald-400/60' : 'ring-black/40'}`}
                              style={{
                                width: 12, height: 12,
                                background: isPending ? '#fbbf24' : isPgm ? '#10b981' : portColor,
                                boxShadow: isPending ? '0 0 10px #fbbf24' : isPgm ? '0 0 10px #10b981' : undefined,
                              }}
                            ></span>
                          </button>
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
                          <MultiviewCell label={t('PGM')} inputPort={pgmSrc?.name ?? ''} srcDev={pgmSrc} color="emerald" big />
                          <MultiviewCell label={t('PVW')} inputPort={pvwSrc?.name ?? ''} srcDev={pvwSrc} color="amber" big />
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

                {/* 오디오 콘솔 preview — 채널/버스 미니뷰 */}
                {isAudioMixer && (() => {
                  const channels = d.audioChannels ?? [];
                  const buses = d.audioBuses ?? [];
                  const matrix = d.mixMatrix ?? {};
                  // 각 버스마다 활성 채널 수 카운트
                  const busActiveCounts = buses.map(b => {
                    const count = channels.filter(ch => matrix[ch.id]?.[b.id]?.enabled).length;
                    return { bus: b, count };
                  });
                  return (
                    <div className="mx-2.5 mb-2.5 space-y-1.5">
                      {/* 채널 페이더 미니뷰 (최대 16개) */}
                      {channels.length > 0 && (
                        <div className="bg-rose-950/30 border border-rose-500/15 rounded p-1.5">
                          <div className="text-[8.5px] text-rose-300/70 font-mono mb-1 flex items-center justify-between">
                            <span>채널</span>
                            <span>{channels.length}ch</span>
                          </div>
                          <div className="flex items-end gap-[2px] h-7">
                            {channels.slice(0, 24).map(ch => (
                              <div
                                key={ch.id}
                                className="flex-1 rounded-sm relative"
                                style={{ background: ch.color ?? '#888', minWidth: 3 }}
                                title={ch.name}
                              >
                                {ch.stereo && (
                                  <div className="absolute -top-1 left-0 right-0 text-[6.5px] text-pink-300 text-center">ST</div>
                                )}
                              </div>
                            ))}
                            {channels.length > 24 && (
                              <div className="text-[8px] text-neutral-500 ml-1">+{channels.length - 24}</div>
                            )}
                          </div>
                        </div>
                      )}
                      {/* 버스 출력 목록 */}
                      {buses.length > 0 && (
                        <div className="space-y-0.5">
                          {busActiveCounts.map(({ bus, count }) => (
                            <div key={bus.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-white/[0.03]">
                              <div className="w-1 h-3 rounded shrink-0" style={{ background: bus.color }}></div>
                              <span className="text-[9.5px] font-mono text-neutral-300 truncate flex-1">{bus.name}</span>
                              {bus.stereo && <span className="text-[8px] text-pink-300 px-1 rounded bg-pink-500/15">ST</span>}
                              <span className="text-[8.5px] font-mono text-emerald-300">{count}/{channels.length}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {channels.length === 0 && (
                        <div className="text-[10px] text-neutral-500 italic text-center py-2">
                          더블클릭 → 채널/버스 설정
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* I/O 박스 preview — 종류/프로토콜/연동 콘솔 표시 */}
                {isIoBox && (() => {
                  const kind = (d.ioBoxKind as 'stagebox' | 'option_card' | undefined) ?? 'stagebox';
                  const protocol = d.ioBoxProtocol ?? 'Dante';
                  const linkedMixer = d.ioBoxLinkedMixerId ? devById.get(d.ioBoxLinkedMixerId) : null;
                  const slot = d.ioBoxSlot;
                  return (
                    <div className="mx-2.5 mb-2.5 space-y-1.5">
                      <div className="bg-cyan-950/30 border border-cyan-500/20 rounded p-2 space-y-1.5">
                        {/* 종류 + 프로토콜 */}
                        <div className="flex items-center justify-between gap-1.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            kind === 'stagebox' ? 'bg-cyan-500/25 text-cyan-200' : 'bg-teal-500/25 text-teal-200'
                          }`}>
                            {kind === 'stagebox' ? '📦 스테이지박스' : '🃏 옵션카드'}
                          </span>
                          <span className="text-[9.5px] font-mono text-cyan-300/80 px-1.5 py-0.5 rounded bg-black/30 border border-cyan-500/20">
                            {protocol}
                          </span>
                        </div>
                        {/* 연동 콘솔 */}
                        {linkedMixer ? (
                          <div className="text-[9.5px] text-cyan-100/80 truncate flex items-center gap-1">
                            <span className="text-[10px]">🔗</span>
                            <span className="font-mono truncate">{linkedMixer.name}</span>
                          </div>
                        ) : (
                          <div className="text-[9.5px] text-neutral-500 italic">콘솔 미연동</div>
                        )}
                        {/* 옵션카드 슬롯 */}
                        {kind === 'option_card' && slot && (
                          <div className="text-[9px] text-teal-300/80 font-mono">📍 {slot}</div>
                        )}
                        {/* IN/OUT 카운트 */}
                        <div className="flex items-center gap-2 text-[9.5px] font-mono pt-1 border-t border-white/5">
                          <span className="text-cyan-300">IN <span className="text-white font-bold">{d.inputs.length}</span></span>
                          <span className="text-neutral-600">·</span>
                          <span className="text-emerald-300">OUT <span className="text-white font-bold">{d.outputs.length}</span></span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* 배전반 preview — 차단기 목록 + 부하 % + 과부하 깜박 */}
                {(isPanelboard || isPowerStrip) && (() => {
                  const panelBreakers = d.breakers ?? [];
                  const mainPhase = d.panelMainPhase ?? 'three';
                  const mainCap = d.panelMainCapacity ?? 100;
                  const mainKind = d.panelMainKind ?? 'MCCB';
                  const mainV = mainPhase === 'three' ? 380 : 220;
                  const totalCapW = mainV * mainCap;
                  const innerLoads = breakerLoads.get(d.id);
                  const sumLoadW = panelBreakers.reduce((s, b) => s + (innerLoads?.get(b.id)?.totalWatts ?? 0), 0);
                  const mainLoadPct = totalCapW > 0 ? (sumLoadW / totalCapW) * 100 : 0;
                  const mainOverload = mainLoadPct > 100;
                  const sumBranchA = panelBreakers.reduce((s, b) => s + b.capacityA, 0);
                  const branchExceedsMain = sumBranchA > mainCap;
                  return (
                    <div className="mx-2.5 mb-2.5 space-y-1.5">
                      {/* 메인 인입 헤더 — 종류 + 상 + 용량 */}
                      <div className={`rounded p-1.5 ${mainOverload ? 'overload-blink' : 'bg-amber-500/15 border border-amber-500/30'}`}>
                        <div className="flex items-center justify-between gap-1.5">
                          <span className={`text-[10px] font-bold flex items-center gap-1 ${mainOverload ? 'overload-text-blink' : 'text-amber-200'}`}>
                            🔝 메인
                            <span className={`text-[8.5px] font-mono px-1 rounded ${
                              mainKind === 'MCCB' ? 'bg-cyan-500/25 text-cyan-200' : 'bg-rose-500/25 text-rose-200'
                            }`}>{mainKind}</span>
                            <span>{mainPhase === 'three' ? '3상' : '단상'} {mainCap}A</span>
                          </span>
                          <span className={`text-[9.5px] font-mono font-bold ${mainOverload ? 'overload-text-blink' : 'text-amber-300'}`}>
                            {Math.round(mainLoadPct)}%
                          </span>
                        </div>
                        <div className="text-[8.5px] font-mono text-amber-200/70 mt-0.5">
                          {formatWatts(sumLoadW)} / {formatWatts(totalCapW)}
                        </div>
                      </div>
                      {/* 부하측 합계가 메인 초과 시 경고 */}
                      {panelBreakers.length > 0 && branchExceedsMain && (
                        <div className="rounded px-1.5 py-1 bg-rose-500/15 border border-rose-500/40 text-[9px] text-rose-200 flex items-center gap-1">
                          ⚠ 부하측 합계 {sumBranchA}A &gt; 메인 {mainCap}A
                        </div>
                      )}
                      {/* 부하측 차단기 목록 */}
                      {panelBreakers.length === 0 ? (
                        <div className="text-[10px] text-neutral-500 italic text-center py-2">
                          더블클릭 → 부하측 차단기 추가
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          {panelBreakers.map(br => {
                            const ld = innerLoads?.get(br.id);
                            const overload = ld?.overload ?? false;
                            const warning = ld?.warning ?? false;
                            const pct = ld?.loadPercent ?? 0;
                            return (
                              <div
                                key={br.id}
                                className={`rounded px-1.5 py-1 flex items-center gap-1.5 ${
                                  overload ? 'overload-blink' : warning ? 'bg-amber-500/15 border border-amber-500/30' : 'bg-white/[0.03] border border-white/5'
                                }`}
                              >
                                <div className="w-1 h-3 rounded shrink-0" style={{ background: br.color ?? '#FBBF24' }}></div>
                                <span className={`text-[8.5px] font-mono px-1 rounded font-bold ${
                                  br.kind === 'MCCB' ? 'bg-cyan-500/20 text-cyan-200' : 'bg-rose-500/20 text-rose-200'
                                }`}>{br.kind}</span>
                                <span className="text-[9.5px] font-mono text-neutral-300 truncate flex-1">{br.name}</span>
                                <span className="text-[8.5px] font-mono text-neutral-400">
                                  {br.phase === 'three' ? '3상' : '단상'} {br.capacityA}A
                                </span>
                                <span className={`text-[9.5px] font-mono font-bold ${
                                  overload ? 'overload-text-blink' : warning ? 'text-amber-300' : 'text-emerald-300'
                                }`}>
                                  {Math.round(pct)}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 전력 공급 preview */}
                {isPowerSupply && (() => {
                  const phase = d.power?.phase ?? 'three';
                  const v = d.power?.voltage ?? (phase === 'three' ? 380 : 220);
                  return (
                    <div className="mx-2.5 mb-2.5">
                      <div className="rounded p-2 bg-yellow-500/10 border border-yellow-500/25 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-yellow-200">🔌 공급 {phase === 'three' ? '3상' : '단상'}</span>
                          <span className="text-[10px] font-mono font-bold text-yellow-300">{v}V</span>
                        </div>
                        {(d.power?.watts || d.power?.amps) && (
                          <div className="text-[9px] font-mono text-yellow-200/70">
                            {d.power?.watts ? formatWatts(d.power.watts) : ''}
                            {d.power?.watts && d.power?.amps ? ' · ' : ''}
                            {d.power?.amps ? formatAmps(d.power.amps) : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 전력 소비 preview — 과부하 차단기에 연결되면 깜박 */}
                {isPowerConsumer && (() => {
                  const phase = d.power?.phase ?? 'single';
                  const v = d.power?.voltage ?? (phase === 'three' ? 380 : 220);
                  const w = deviceWatts(d);
                  const a = deviceAmps(d);
                  const isOverloaded = overloadConsumerIds.has(d.id);
                  return (
                    <div className="mx-2.5 mb-2.5">
                      <div className={`rounded p-2 ${
                        isOverloaded ? 'overload-blink' : 'bg-orange-500/10 border border-orange-500/25'
                      } space-y-0.5`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-bold ${isOverloaded ? 'overload-text-blink' : 'text-orange-200'}`}>
                            💡 소비 {phase === 'three' ? '3상' : '단상'} {v}V
                          </span>
                          {isOverloaded && (
                            <span className="overload-text-blink text-[9px] font-bold">⚠ 과부하</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[9.5px] font-mono">
                          <span className={isOverloaded ? 'overload-text-blink' : 'text-orange-300'}>
                            {formatWatts(w)}
                          </span>
                          <span className="text-neutral-600">·</span>
                          <span className={isOverloaded ? 'overload-text-blink' : 'text-orange-300/80'}>
                            {formatAmps(a)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              </div>

              {/* 왼쪽: IN 쪽 Hub 연결 배지 (각 IN 포트와 y좌표 정렬) */}
              {!isPatchbay && !isWallbox && role !== 'router' && inVis.length > 0 && (hubConnections.length > 0 || hidePatchbay) && (
                <div
                  data-ui
                  data-follow={d.id}
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
                        const portNum = firstHop.hub.inputs.indexOf(firstHop.inPort) + 1;
                        const code = hubCode(firstHop.hub, firstHop.inPort);
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
                  data-follow={d.id}
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
                            const hubPortNum = hubDev.inputs.indexOf(info.destConn.to_port) + 1;
                            const code = hubCode(hubDev, info.destConn.to_port);
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
                        const portNum = firstHop.hub.inputs.indexOf(firstHop.inPort) + 1;
                        const code = hubCode(firstHop.hub, firstHop.inPort);
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
          enabledRoles={currentProject?.enabled_roles}
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
            setConnections(prev => prev.filter(c => c.id !== snapshot.id));
            setEditingCable(null);
            await (supabase as any).from('connections').delete().eq('id', snapshot.id);
            pushUndo('케이블 삭제 되돌리기', () => restoreDevicesAndConns([], [snapshot]));
          }}
        />
      )}

      {editingMixer && (
        <AudioMixerEditor
          device={editingMixer}
          allDevices={devices}
          onClose={() => setEditingMixer(null)}
          onSave={async (updates) => {
            // 낙관적 업데이트
            setDevices(prev => prev.map(d => d.id === editingMixer.id ? { ...d, ...updates } : d));
            // DB 저장 — 누락 컬럼 자동 fallback (handleSaveDevice 패턴)
            try {
              await (supabase as any).from('devices').update(updates).eq('id', editingMixer.id);
            } catch (err: any) {
              const msg = String(err?.message ?? err);
              const m = msg.match(/Could not find the '(\w+)' column/);
              if (m) {
                const missing = m[1];
                const clean: any = { ...updates };
                delete clean[missing];
                await (supabase as any).from('devices').update(clean).eq('id', editingMixer.id);
                console.warn(`[AudioMixer] '${missing}' 컬럼 없음 — 해당 필드 제외 저장. supabase/schema.sql 실행 필요.`);
              } else {
                console.error('[AudioMixer] 저장 실패', err);
              }
            }
            setEditingMixer(null);
          }}
        />
      )}

      {showProjectSettings && currentProject && (
        <ProjectSettingsModal
          project={currentProject}
          onClose={() => setShowProjectSettings(false)}
          onSaved={(updated) => {
            setCurrentProject(updated);
            setShowProjectSettings(false);
          }}
        />
      )}

      {editingPanel && (
        <PanelboardEditor
          device={editingPanel}
          onClose={() => setEditingPanel(null)}
          onSave={async (updates) => {
            // 낙관적 업데이트
            setDevices(prev => prev.map(d => d.id === editingPanel.id ? { ...d, ...updates } : d));
            try {
              await (supabase as any).from('devices').update(updates).eq('id', editingPanel.id);
            } catch (err: any) {
              const msg = String(err?.message ?? err);
              const m = msg.match(/Could not find the '(\w+)' column/);
              if (m) {
                const missing = m[1];
                const clean: any = { ...updates };
                delete clean[missing];
                await (supabase as any).from('devices').update(clean).eq('id', editingPanel.id);
                console.warn(`[Panelboard] '${missing}' 컬럼 없음 — 해당 필드 제외 저장. supabase/schema.sql 실행 필요.`);
              } else {
                console.error('[Panelboard] 저장 실패', err);
              }
            }
            setEditingPanel(null);
          }}
        />
      )}
    </div>
  );
}
