import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});

// 연결(케이블) 방식
export const CONNECTION_TYPES = [
  'SDI', '12G-SDI', 'HDMI', 'DVI',
  'FIBER', 'NDI', 'SMPTE-2110', 'IP',
  'AES', 'DANTE', 'MADI', 'AoIP',
  'XLR', 'ANALOG',
  'USB', 'GPIO', 'LAN', 'RS-422', 'TIE',
] as const;

export type ConnectionType = typeof CONNECTION_TYPES[number];

export type PortInfo = {
  name: string;          // 포트 식별자 (예: "OP-1")
  label?: string;        // 물리 포트 이름 (예: "CCU-1 12G OP-1")
  connType?: ConnectionType; // 이 포트의 케이블 방식
};

export type Device = {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'combined';
  x: number;
  y: number;
  width?: number;   // 기본 180
  height?: number;  // 자동 계산 or 커스텀
  inputs: string[];                       // 기존 호환 - 포트 이름들
  outputs: string[];                      // 기존 호환
  inputsMeta?: Record<string, PortInfo>;  // 포트별 메타 (label, connType)
  outputsMeta?: Record<string, PortInfo>;
  physPorts: Record<string, string>;      // legacy - label 용도로 유지
  routing: Record<string, string>;        // legacy - 라우팅명
};

export type Connection = {
  id: string;
  from_device: string;
  from_port: string;
  to_device: string;
  to_port: string;
  conn_type?: ConnectionType;  // 이 케이블의 연결 방식
};
