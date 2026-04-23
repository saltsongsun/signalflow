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

export type Device = {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'combined';
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
