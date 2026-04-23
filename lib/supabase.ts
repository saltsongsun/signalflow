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

export type Device = {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'combined';
  x: number;
  y: number;
  inputs: string[];
  outputs: string[];
  physPorts: Record<string, string>;
  routing: Record<string, string>;
};

export type Connection = {
  id: string;
  from_device: string;
  from_port: string;
  to_device: string;
  to_port: string;
};
