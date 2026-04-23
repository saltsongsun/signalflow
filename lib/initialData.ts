import type { Device } from './supabase';

export const INITIAL_DEVICES: Device[] = [
  { id: 'cam1', name: 'CAM 1', type: 'video', x: 60, y: 80, inputs: [], outputs: ['SDI OP'], physPorts: { 'SDI OP': 'CCU-1 12G OP' }, routing: { 'SDI OP': 'R/S IP-1' } },
  { id: 'cam2', name: 'CAM 2', type: 'video', x: 60, y: 180, inputs: [], outputs: ['SDI OP'], physPorts: { 'SDI OP': 'CCU-2 12G OP' }, routing: { 'SDI OP': 'R/S IP-2' } },
  { id: 'cam3', name: 'CAM 3', type: 'video', x: 60, y: 280, inputs: [], outputs: ['SDI OP'], physPorts: { 'SDI OP': 'CCU-3 12G OP' }, routing: { 'SDI OP': 'R/S IP-3' } },
  { id: 'cam4', name: 'CAM 4', type: 'video', x: 60, y: 380, inputs: [], outputs: ['SDI OP'], physPorts: { 'SDI OP': 'CCU-4 12G OP' }, routing: { 'SDI OP': 'R/S IP-4' } },
  { id: 'mic1', name: 'MIC 1-4', type: 'audio', x: 60, y: 500, inputs: [], outputs: ['AES1', 'AES2'], physPorts: { 'AES1': 'W/BOX-1 OP', 'AES2': 'W/BOX-1 OP' }, routing: { 'AES1': 'AMU IP-13', 'AES2': 'AMU IP-14' } },
  { id: 'mic2', name: 'W/L MIC', type: 'audio', x: 60, y: 600, inputs: [], outputs: ['AES'], physPorts: { 'AES': 'W/L RX OP' }, routing: { 'AES': 'AMU IP-17' } },
  { id: 'router', name: '32x32 Router', type: 'video', x: 340, y: 220, inputs: ['IP1','IP2','IP3','IP4','IP5','IP6','IP7','IP8'], outputs: ['OP1','OP2','OP3','OP4','OP5','OP6'], physPorts: {}, routing: {} },
  { id: 'amu', name: 'Audio Mixer (AMU)', type: 'audio', x: 340, y: 520, inputs: ['CH1','CH2','CH3','CH4'], outputs: ['BUS1','BUS2','AUX1'], physPorts: {}, routing: {} },
  { id: 'mvs', name: 'Main Video Switcher', type: 'video', x: 620, y: 160, inputs: ['IP1','IP2','IP3','IP4'], outputs: ['PGM','CLEAN','PVW'], physPorts: {}, routing: {} },
  { id: 'emb', name: 'Embedder', type: 'combined', x: 620, y: 400, inputs: ['VIDEO IN','AUDIO IN'], outputs: ['SDI+EMB OUT'], physPorts: {}, routing: {} },
  { id: 'led', name: 'Stage LED', type: 'video', x: 900, y: 100, inputs: ['HDMI'], outputs: [], physPorts: { 'HDMI': 'MCU-1 HDMI' }, routing: {} },
  { id: 'pgm_out', name: 'PGM Output', type: 'combined', x: 900, y: 220, inputs: ['SDI'], outputs: [], physPorts: { 'SDI': 'VDA1-7 IP' }, routing: { 'SDI': 'R/S OP-27' } },
  { id: 'ingest', name: 'INGEST SVR', type: 'combined', x: 900, y: 320, inputs: ['SDI'], outputs: [], physPorts: { 'SDI': 'INGEST IP-3' }, routing: { 'SDI': 'R/S OP-32' } },
  { id: 'speaker', name: 'C/R Speaker', type: 'audio', x: 900, y: 500, inputs: ['AES'], outputs: [], physPorts: { 'AES': 'AMU OP' }, routing: {} },
  { id: 'pa', name: 'PA Mixer', type: 'audio', x: 900, y: 600, inputs: ['AES'], outputs: [], physPorts: { 'AES': 'AMU BUS1' }, routing: {} },
];

export const INITIAL_CONNECTIONS = [
  { from_device: 'cam1', from_port: 'SDI OP', to_device: 'router', to_port: 'IP1' },
  { from_device: 'cam2', from_port: 'SDI OP', to_device: 'router', to_port: 'IP2' },
  { from_device: 'cam3', from_port: 'SDI OP', to_device: 'router', to_port: 'IP3' },
  { from_device: 'cam4', from_port: 'SDI OP', to_device: 'router', to_port: 'IP4' },
  { from_device: 'router', from_port: 'OP1', to_device: 'mvs', to_port: 'IP1' },
  { from_device: 'router', from_port: 'OP2', to_device: 'mvs', to_port: 'IP2' },
  { from_device: 'router', from_port: 'OP3', to_device: 'led', to_port: 'HDMI' },
  { from_device: 'mvs', from_port: 'PGM', to_device: 'emb', to_port: 'VIDEO IN' },
  { from_device: 'mvs', from_port: 'CLEAN', to_device: 'ingest', to_port: 'SDI' },
  { from_device: 'mic1', from_port: 'AES1', to_device: 'amu', to_port: 'CH1' },
  { from_device: 'mic1', from_port: 'AES2', to_device: 'amu', to_port: 'CH2' },
  { from_device: 'mic2', from_port: 'AES', to_device: 'amu', to_port: 'CH3' },
  { from_device: 'amu', from_port: 'BUS1', to_device: 'emb', to_port: 'AUDIO IN' },
  { from_device: 'amu', from_port: 'BUS2', to_device: 'speaker', to_port: 'AES' },
  { from_device: 'amu', from_port: 'AUX1', to_device: 'pa', to_port: 'AES' },
  { from_device: 'emb', from_port: 'SDI+EMB OUT', to_device: 'pgm_out', to_port: 'SDI' },
];

export const TYPE_COLORS = {
  video:    { main: '#3B82F6', glow: '#60A5FA', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.5)' },
  audio:    { main: '#EF4444', glow: '#F87171', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.5)' },
  combined: { main: '#A855F7', glow: '#C084FC', bg: 'rgba(168,85,247,0.08)',  border: 'rgba(168,85,247,0.5)' },
};
