import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: { params: { eventsPerSecond: 20 } },
});

export const CONNECTION_TYPES = [
  'SDI', '12G-SDI', 'HDMI', 'DVI',
  'FIBER', 'NDI', 'SMPTE-2110', 'IP',
  'AES', 'DANTE', 'MADI', 'AoIP',
  'XLR', 'ANALOG',
  'USB', 'GPIO', 'LAN', 'RS-422', 'TIE',
] as const;

export type ConnectionType = typeof CONNECTION_TYPES[number];

export type PortInfo = {
  name: string;
  label?: string;
  connType?: ConnectionType;
  layerId?: string;  // 포트가 속한 레이어
};

// 장비 역할
export const DEVICE_ROLES = [
  'standard', 'switcher', 'router', 'splitter', 'patchbay', 'wallbox',
  'source', 'display', 'connector',
] as const;
export type DeviceRole = typeof DEVICE_ROLES[number];

export const DEVICE_ROLE_LABELS: Record<DeviceRole, string> = {
  standard:  '일반',
  switcher:  '스위처',
  router:    '라우터',
  splitter:  '스플리터',
  patchbay:  '패치베이',
  wallbox:   '월박스',
  source:    '소스',
  display:   '디스플레이',
  connector: '연결',
};

// 가상 랙 (패치베이 관리 페이지에서 사용)
export type Rack = {
  id: string;
  name: string;           // 예: "Main Rack A", "부조 Rack #1"
  location?: string;      // 설치 위치
  totalUnits: number;     // 전체 유닛 수 (예: 42U)
  sort_order: number;
  created_at?: string;
};

export type Device = {
  id: string;
  name: string;
  model?: string;        // 모델명 (예: "XVS-G1", "AVANTIS 48/16", "ADC PPS3")
  type: 'video' | 'audio' | 'combined';
  role?: DeviceRole;
  pgmPort?: string;
  // patchbay 전용: 입력 포트명 → 출력 포트명 기본 통로 매핑
  // 예: { 'IN-01': 'OUT-01', 'IN-02': 'OUT-02' }
  // 'normal' 상태에서는 이 매핑대로 신호가 통과
  normals?: Record<string, string>;
  // wallbox 전용: 설치 장소 + 방번호
  location?: string;   // 예: '주경기장', '중계석#1', 'PC 존', '선수대기실-1'
  roomNumber?: string; // 예: 'WB-101', 'OBS-01'
  // 가상 랙 배치 (주로 패치베이에 사용)
  rackId?: string;     // 속한 랙 ID
  rackUnit?: number;   // 랙 내 유닛 번호 (1부터 시작, 위가 1)
  rotation?: 0 | 90 | 180 | 270;  // 장비 카드 회전 각도 (주로 패치베이)
  // 소스/디스플레이 시뮬레이션
  imageUrl?: string;       // 소스 장비의 재생 이미지 URL
  imageStoragePath?: string; // Supabase Storage path (삭제용)
  audioUrl?: string;       // 소스 장비의 재생 오디오 URL
  audioStoragePath?: string;
  selectedInput?: string;  // 스위처/라우터가 현재 OUT으로 보내는 IN 포트
  // 그룹화
  groupId?: string;    // 같은 그룹끼리는 동일 id
  groupName?: string;  // 그룹 표시명 (같은 groupId면 동일)
  x: number;
  y: number;
  width?: number;
  height?: number;
  inputs: string[];
  outputs: string[];
  inputsMeta?: Record<string, PortInfo>;
  outputsMeta?: Record<string, PortInfo>;
  physPorts: Record<string, string>;
  routing: Record<string, string>;
};

export type Connection = {
  id: string;
  from_device: string;
  from_port: string;
  to_device: string;
  to_port: string;
  conn_type?: ConnectionType;
  tie_line?: string;      // Tie-Line 번호 (예: "TIE-V001")
  is_patch?: boolean;     // true면 수동 패치, false면 normal (기본배선)
};

export type Layer = {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  sort_order: number;
};

// 기본 레이어 (초기 시드용)
export const DEFAULT_LAYERS: Layer[] = [
  { id: 'layer_video',  name: 'Video',    color: '#3B82F6', visible: true, sort_order: 1 },
  { id: 'layer_audio',  name: 'Audio',    color: '#EF4444', visible: true, sort_order: 2 },
  { id: 'layer_tie',    name: 'Tie-Line', color: '#A855F7', visible: true, sort_order: 3 },
  { id: 'layer_control',name: 'Control',  color: '#10B981', visible: true, sort_order: 4 },
];
