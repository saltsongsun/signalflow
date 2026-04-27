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
  'source', 'display', 'multiview', 'audio_mixer', 'io_box',
  'panelboard', 'power_supply', 'power_consumer',
  'connector',
] as const;
export type DeviceRole = typeof DEVICE_ROLES[number];

export const DEVICE_ROLE_LABELS: Record<DeviceRole, string> = {
  standard:       '일반',
  switcher:       '스위처',
  router:         '라우터',
  splitter:       '스플리터',
  patchbay:       '패치베이',
  wallbox:        '월박스',
  source:         '소스',
  display:        '디스플레이',
  multiview:      '멀티뷰',
  audio_mixer:    '오디오 콘솔',
  io_box:         'I/O 박스',
  panelboard:     '배전반',
  power_supply:   '전력 공급',
  power_consumer: '전력 소비',
  connector:      '연결',
};

// I/O 박스 종류
export type IoBoxKind = 'stagebox' | 'option_card';
export const IO_BOX_KIND_LABELS: Record<IoBoxKind, string> = {
  stagebox:    '스테이지박스',
  option_card: '옵션카드',
};

// 네트워크 프로토콜 (콘솔↔IO박스 연결 방식)
export const IO_BOX_PROTOCOLS = [
  'Dante', 'MADI', 'AES50', 'REAC', 'SoundGrid', 'AVB', 'AES67', 'Cat6/Custom',
] as const;
export type IoBoxProtocol = typeof IO_BOX_PROTOCOLS[number];

// ============================================================
// 전력 시스템 (배전반 / 차단기 / 공급·소비 장비)
// ============================================================

// 차단기 종류
export type BreakerKind = 'MCCB' | 'ELCB';
export const BREAKER_KIND_LABELS: Record<BreakerKind, string> = {
  MCCB: '배선차단기 (MCCB)',
  ELCB: '누전차단기 (ELCB)',
};

// 상 (위상)
export type PhaseType = 'single' | 'three';
export const PHASE_LABELS: Record<PhaseType, string> = {
  single: '단상 220V',
  three:  '3상 380V',
};
export const PHASE_VOLTAGE: Record<PhaseType, number> = {
  single: 220,
  three:  380,
};

// 차단기 용량 (A)
export const BREAKER_CAPACITIES = [20, 30, 50, 75, 100] as const;
export type BreakerCapacity = typeof BREAKER_CAPACITIES[number];

// 차단기 1개 = 배전반 안의 회로 1개
export type Breaker = {
  id: string;          // 'br1', 'br2'... (배전반 내 unique)
  name: string;        // 'Ch1', '조명-1F' 등
  kind: BreakerKind;
  phase: PhaseType;
  capacityA: BreakerCapacity;
  // 이 차단기에서 공급받는 IN 포트 이름 (배전반의 inputs[]에 매핑)
  // 예: 'OUT-1' (배전반의 OUT 포트와 연결된 소비 장비들의 합산 부하)
  outputPort?: string;  // 이 차단기가 출력으로 사용하는 배전반 OUT 포트
  color?: string;
};

// 전력 사양 (공급/소비 장비)
export type PowerSpec = {
  // 공급 장비: 단순 정보. 소비 장비: 실제 부하 계산에 사용.
  watts?: number;       // 와트 (W) — 직접 입력
  amps?: number;        // 전류 (A) — W = V × A 역산 가능
  phase?: PhaseType;    // 단상/3상
  voltage?: number;     // 직접 지정 (없으면 phase에서 계산)
  isSupply?: boolean;   // true = 공급(전력회사/UPS 등), false = 소비
};


// ===== 프로젝트 =====
export type ProjectCategory = 'broadcast' | 'audio' | 'general' | 'custom';

export const PROJECT_CATEGORY_LABELS: Record<ProjectCategory, string> = {
  broadcast: '방송 시스템',
  audio:     '음향 시스템',
  general:   '일반 신호도면',
  custom:    '기타',
};

export const PROJECT_CATEGORY_COLORS: Record<ProjectCategory, string> = {
  broadcast: '#3B82F6',
  audio:     '#EC4899',
  general:   '#10B981',
  custom:    '#A855F7',
};

export type Project = {
  id: string;
  name: string;
  description?: string;
  category: ProjectCategory;
  template_id?: string;
  passcode?: string;
  thumbnail_color?: string;
  icon?: string;
  terminology?: Record<string, string>;  // 라벨 오버라이드
  enabled_roles?: DeviceRole[];           // 비어있으면 전체 활성
  // 배경 이미지 (도면 위에 깔리는 참조 이미지)
  background_image_url?: string;
  background_opacity?: number;     // 0~100
  background_x?: number;
  background_y?: number;
  background_scale?: number;       // 1.0 = 100%
  background_locked?: boolean;     // true면 이미지 이동/리사이즈 방지
  created_at?: string;
  updated_at?: string;
};

// ===== 오디오 콘솔 =====
// 채널: 콘솔 내부 처리 단위
export type AudioChannel = {
  id: string;          // 'ch1', 'ch2'...
  name: string;        // 'Vocal', 'BGM' 등
  stereo: boolean;     // 스테레오 채널 여부 (L/R 페어)
  color?: string;      // 채널 색상 (UI용)
};

// 버스: 메인/AUX/그룹
export type AudioBusType = 'main' | 'aux' | 'group' | 'matrix';
export const AUDIO_BUS_TYPE_LABELS: Record<AudioBusType, string> = {
  main:   'MAIN',
  aux:    'AUX',
  group:  'GROUP',
  matrix: 'MATRIX',
};

export type AudioBus = {
  id: string;          // 'main', 'aux1'...
  name: string;        // 'MAIN L/R', '무대 모니터'
  type: AudioBusType;
  stereo: boolean;
  color?: string;
};

// 패치: 물리 IN 단자 → 채널 매핑
export type AudioPatchEntry = {
  channelId: string;
  side?: 'mono' | 'L' | 'R';  // 스테레오 채널의 L/R 또는 모노
};

// 출력 패치: 버스 → 물리 OUT 단자
export type AudioOutPatchEntry = {
  busId: string;
  side?: 'mono' | 'L' | 'R';
};

// 믹스 매트릭스 셀: 채널 → 버스로 보내는 양
export type MixMatrixCell = {
  enabled: boolean;
  level: number;       // dB (-100 ~ +10), -100 = mute
  pan?: number;        // -100 (L) ~ 0 (center) ~ +100 (R), 모노 채널이 스테레오 버스로 갈 때
  prePost?: 'pre' | 'post';  // AUX용: 페이더 적용 전/후
};


// 멀티뷰 레이아웃 프리셋
// PGM/PVW 2칸 + 나머지 소스 모니터 셀 구조
export const MULTIVIEW_LAYOUTS = {
  'pgm+pvw+4':  { label: 'PGM/PVW + 4소스',  sourceCells: 4,  layout: '2+4'  },
  'pgm+pvw+6':  { label: 'PGM/PVW + 6소스',  sourceCells: 6,  layout: '2+6'  },
  'pgm+pvw+8':  { label: 'PGM/PVW + 8소스',  sourceCells: 8,  layout: '2+8'  },
  'pgm+pvw+10': { label: 'PGM/PVW + 10소스', sourceCells: 10, layout: '2+10' },
  'pgm+pvw+12': { label: 'PGM/PVW + 12소스', sourceCells: 12, layout: '2+12' },
  'pgm+pvw+14': { label: 'PGM/PVW + 14소스', sourceCells: 14, layout: '2+14' },
  '2x2':        { label: '4분할 2×2 (PGM/PVW만)', sourceCells: 0,  layout: '2x2' },
  '3x3':        { label: '9분할 3×3',              sourceCells: 7,  layout: '3x3' },
  '4x4':        { label: '16분할 4×4',             sourceCells: 14, layout: '4x4' },
  '5x5':        { label: '25분할 5×5',             sourceCells: 23, layout: '5x5' },
} as const;

export type MultiviewLayoutId = keyof typeof MULTIVIEW_LAYOUTS;

// 가상 랙 (패치베이 관리 페이지에서 사용)
export type Rack = {
  id: string;
  name: string;           // 예: "Main Rack A", "부조 Rack #1"
  location?: string;      // 설치 위치
  totalUnits: number;     // 전체 유닛 수 (예: 42U)
  sort_order: number;
  created_at?: string;
  project_id?: string;
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
  // 스위처: PVW(Preview) 포트 — PGM으로 올라갈 예비 소스
  pvwPort?: string;
  // 멀티뷰 장비 전용
  multiviewLayout?: MultiviewLayoutId;  // 레이아웃 선택
  multiviewPgmInput?: string;  // PGM으로 표시할 IN 포트명 (linkedSwitcher가 없을 때만 사용)
  multiviewPvwInput?: string;  // PVW로 표시할 IN 포트명 (linkedSwitcher가 없을 때만 사용)
  multiviewLinkedSwitcherId?: string;  // 연동 스위처 ID — 설정되면 자동으로 PGM/PVW/소스 가져옴
  // 나머지 IN들은 자동으로 소스 모니터 셀에 순서대로 배치됨

  // 오디오 콘솔 전용
  audioChannels?: AudioChannel[];                                // 채널 목록
  audioBuses?: AudioBus[];                                       // 버스 목록
  audioPatch?: Record<string, AudioPatchEntry>;                  // 물리 IN → 채널
  audioOutPatch?: Record<string, AudioOutPatchEntry>;            // 버스 → 물리 OUT
  mixMatrix?: Record<string, Record<string, MixMatrixCell>>;     // mixMatrix[chId][busId]

  // I/O 박스 (스테이지박스 / 옵션카드) 전용
  ioBoxKind?: IoBoxKind;          // 'stagebox' or 'option_card'
  ioBoxProtocol?: IoBoxProtocol;  // 'Dante', 'MADI' 등
  ioBoxLinkedMixerId?: string;    // 연동된 콘솔 ID (콘솔의 input pool로 편입)
  ioBoxSlot?: string;             // 옵션카드: 콘솔의 슬롯 번호 (예: 'Slot A')

  // 배전반 전용
  breakers?: Breaker[];           // 차단기 목록
  panelMainPhase?: PhaseType;     // 메인 인입 상 (단상/3상)
  panelMainCapacity?: BreakerCapacity;  // 메인 차단기 용량
  // 전력 공급/소비 장비 전용
  power?: PowerSpec;
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
  project_id?: string;  // 멀티 프로젝트 지원
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
  project_id?: string;
};

export type Layer = {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  sort_order: number;
  project_id?: string;
};

// 기본 레이어 (초기 시드용)
export const DEFAULT_LAYERS: Layer[] = [
  { id: 'layer_video',  name: 'Video',    color: '#3B82F6', visible: true, sort_order: 1 },
  { id: 'layer_audio',  name: 'Audio',    color: '#EF4444', visible: true, sort_order: 2 },
  { id: 'layer_tie',    name: 'Tie-Line', color: '#A855F7', visible: true, sort_order: 3 },
  { id: 'layer_control',name: 'Control',  color: '#10B981', visible: true, sort_order: 4 },
];
