import type { Device, Connection, Layer, Project, ProjectCategory, DeviceRole } from './supabase';

export type ProjectTemplate = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: ProjectCategory;
  enabledRoles: DeviceRole[];
  terminology: Record<string, string>;  // 용어 오버라이드 ("PGM" → "주출력" 등)
  layers: Omit<Layer, 'id'>[];
  // 미리 만들어진 장비 (선택사항)
  starterDevices?: Array<Omit<Device, 'id' | 'project_id'> & { idHint?: string }>;
  starterConnections?: Array<Omit<Connection, 'id' | 'project_id'>>;
};

// ============================================================
// 템플릿 정의
// ============================================================

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  // ----- 빈 프로젝트 -----
  {
    id: 'blank',
    name: '빈 프로젝트',
    description: '아무것도 없는 깨끗한 도면. 처음부터 자유롭게.',
    icon: '⬜',
    color: '#6B7280',
    category: 'general',
    enabledRoles: ['standard', 'source', 'display', 'connector'],
    terminology: {},
    layers: [
      { name: 'Layer 1', color: '#3B82F6', visible: true, sort_order: 0 },
    ],
  },

  // ----- 방송 시스템 -----
  {
    id: 'broadcast_uhd',
    name: 'UHD 방송 시스템',
    description: '스위처, 라우터, 멀티뷰, 패치베이를 갖춘 풀세트 방송 시스템',
    icon: '📡',
    color: '#3B82F6',
    category: 'broadcast',
    enabledRoles: ['standard', 'switcher', 'router', 'splitter', 'patchbay', 'wallbox', 'source', 'display', 'multiview', 'connector'],
    terminology: {},
    layers: [
      { name: 'Video', color: '#3B82F6', visible: true, sort_order: 0 },
      { name: 'Audio', color: '#F43F5E', visible: true, sort_order: 1 },
      { name: 'V + A',  color: '#A855F7', visible: true, sort_order: 2 },
      { name: 'Reference', color: '#84CC16', visible: false, sort_order: 3 },
    ],
  },

  // ----- 음향 시스템 -----
  {
    id: 'audio_live',
    name: '라이브 음향 시스템',
    description: '오디오 콘솔 + 스테이지박스 + 모니터 시스템',
    icon: '🎚',
    color: '#EC4899',
    category: 'audio',
    enabledRoles: ['standard', 'audio_mixer', 'io_box', 'patchbay', 'wallbox', 'source', 'display', 'connector'],
    terminology: {
      'PGM': 'MAIN',
      'PVW': 'AUX',
    },
    layers: [
      { name: 'Audio',   color: '#F43F5E', visible: true, sort_order: 0 },
      { name: 'Network', color: '#06B6D4', visible: true, sort_order: 1 },
      { name: 'Power',   color: '#FACC15', visible: false, sort_order: 2 },
    ],
  },

  // ----- 회의실 AV -----
  {
    id: 'conference_av',
    name: '회의실 AV',
    description: '간단한 회의실 음향/영상 시스템',
    icon: '🏢',
    color: '#10B981',
    category: 'general',
    enabledRoles: ['standard', 'source', 'display', 'switcher', 'wallbox', 'connector'],
    terminology: {},
    layers: [
      { name: 'Video', color: '#3B82F6', visible: true, sort_order: 0 },
      { name: 'Audio', color: '#F43F5E', visible: true, sort_order: 1 },
      { name: 'Control', color: '#FACC15', visible: true, sort_order: 2 },
    ],
  },

  // ----- 일반 신호 도면 -----
  {
    id: 'generic_signal',
    name: '일반 신호 도면',
    description: '범용 신호 흐름 도면 (전원/데이터/통신 등)',
    icon: '📊',
    color: '#A855F7',
    category: 'general',
    enabledRoles: ['standard', 'source', 'display', 'router', 'splitter', 'connector'],
    terminology: {
      'PGM': '주출력',
      'PVW': '예비',
      '스위처': '선택기',
      '라우터': '분배기',
      '디스플레이': '수신부',
      '소스': '발신부',
    },
    layers: [
      { name: '주 신호', color: '#3B82F6', visible: true, sort_order: 0 },
      { name: '보조 신호', color: '#F59E0B', visible: true, sort_order: 1 },
      { name: '제어', color: '#10B981', visible: true, sort_order: 2 },
    ],
  },
];

export function getTemplateById(id?: string): ProjectTemplate {
  return PROJECT_TEMPLATES.find(t => t.id === id) ?? PROJECT_TEMPLATES[0];
}
