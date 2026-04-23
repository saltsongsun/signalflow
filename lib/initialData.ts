import type { Device, ConnectionType } from './supabase';

// ============================================================
// 경남이스포츠 상설경기장 UHD 방송시스템 - 도면 반영
// ============================================================

type DeviceSeed = Omit<Device, 'inputsMeta' | 'outputsMeta' | 'physPorts' | 'routing'> & {
  inputsMeta?: Record<string, { label?: string; connType?: ConnectionType }>;
  outputsMeta?: Record<string, { label?: string; connType?: ConnectionType }>;
};

const videoDevices: DeviceSeed[] = [
  // Col 1: Sources
  { id: 'cam1', name: 'CAM 1', type: 'video', x: 40, y: 40, inputs: [], outputs: ['SDI'],
    outputsMeta: { 'SDI': { label: 'CAM-1 12G OP', connType: '12G-SDI' } } },
  { id: 'cam2', name: 'CAM 2', type: 'video', x: 40, y: 140, inputs: [], outputs: ['SDI'],
    outputsMeta: { 'SDI': { label: 'CAM-2 12G OP', connType: '12G-SDI' } } },
  { id: 'cam3', name: 'CAM 3', type: 'video', x: 40, y: 240, inputs: [], outputs: ['SDI'],
    outputsMeta: { 'SDI': { label: 'CAM-3 12G OP', connType: '12G-SDI' } } },
  { id: 'cam4', name: 'CAM 4', type: 'video', x: 40, y: 340, inputs: [], outputs: ['SDI'],
    outputsMeta: { 'SDI': { label: 'CAM-4 12G OP', connType: '12G-SDI' } } },
  { id: 'ptz1', name: 'PTZ CAM-1', type: 'video', x: 40, y: 460, inputs: [], outputs: ['SDI'],
    outputsMeta: { 'SDI': { label: 'PTZ-1 OP', connType: 'SDI' } } },
  { id: 'ptz2', name: 'PTZ CAM-2', type: 'video', x: 40, y: 540, inputs: [], outputs: ['SDI'],
    outputsMeta: { 'SDI': { connType: 'SDI' } } },
  { id: 'ptz3', name: 'PTZ CAM-3', type: 'video', x: 40, y: 620, inputs: [], outputs: ['SDI'],
    outputsMeta: { 'SDI': { connType: 'SDI' } } },
  { id: 'fiber_tx1', name: 'FIBER TX-1 (중계석)', type: 'video', x: 40, y: 720, inputs: ['SDI IP'], outputs: ['FIBER OP'],
    inputsMeta: { 'SDI IP': { connType: 'SDI' } },
    outputsMeta: { 'FIBER OP': { label: '중계석#1 CAM-1 FIBER', connType: 'FIBER' } } },
  { id: 'fiber_tx2', name: 'FIBER TX-2 (중계석)', type: 'video', x: 40, y: 820, inputs: ['SDI IP'], outputs: ['FIBER OP'],
    outputsMeta: { 'FIBER OP': { connType: 'FIBER' } } },
  { id: 'fiber_tx3', name: 'FIBER TX-3 (보조)', type: 'video', x: 40, y: 920, inputs: ['SDI IP'], outputs: ['FIBER OP'],
    outputsMeta: { 'FIBER OP': { connType: 'FIBER' } } },

  // Col 2: CCU / Fiber RX
  { id: 'ccu1', name: 'CCU-1', type: 'video', x: 260, y: 40, inputs: ['FIBER IP'], outputs: ['12G OP-1','12G OP-2','12G OP-3'],
    inputsMeta: { 'FIBER IP': { connType: 'FIBER' } },
    outputsMeta: {
      '12G OP-1': { label: 'VDA1-1A IP', connType: '12G-SDI' },
      '12G OP-2': { label: 'VDA2-1A IP', connType: '12G-SDI' },
      '12G OP-3': { label: 'R/S IP-1', connType: '12G-SDI' },
    } },
  { id: 'ccu2', name: 'CCU-2', type: 'video', x: 260, y: 140, inputs: ['FIBER IP'], outputs: ['12G OP-1','12G OP-2','12G OP-3'],
    inputsMeta: { 'FIBER IP': { connType: 'FIBER' } },
    outputsMeta: {
      '12G OP-1': { connType: '12G-SDI' },
      '12G OP-2': { connType: '12G-SDI' },
      '12G OP-3': { label: 'R/S IP-2', connType: '12G-SDI' },
    } },
  { id: 'ccu3', name: 'CCU-3', type: 'video', x: 260, y: 240, inputs: ['FIBER IP'], outputs: ['12G OP-1','12G OP-2','12G OP-3'],
    inputsMeta: { 'FIBER IP': { connType: 'FIBER' } },
    outputsMeta: {
      '12G OP-1': { connType: '12G-SDI' },
      '12G OP-2': { connType: '12G-SDI' },
      '12G OP-3': { label: 'R/S IP-3', connType: '12G-SDI' },
    } },
  { id: 'ccu4', name: 'CCU-4', type: 'video', x: 260, y: 340, inputs: ['FIBER IP'], outputs: ['12G OP-1','12G OP-2','12G OP-3'],
    inputsMeta: { 'FIBER IP': { connType: 'FIBER' } },
    outputsMeta: {
      '12G OP-1': { connType: '12G-SDI' },
      '12G OP-2': { connType: '12G-SDI' },
      '12G OP-3': { label: 'R/S IP-4', connType: '12G-SDI' },
    } },
  { id: 'fiber_rx1', name: 'FIBER RX-1', type: 'video', x: 260, y: 720, inputs: ['FIBER IP'], outputs: ['SDI OP'],
    inputsMeta: { 'FIBER IP': { connType: 'FIBER' } },
    outputsMeta: { 'SDI OP': { connType: 'SDI' } } },
  { id: 'fiber_rx2', name: 'FIBER RX-2', type: 'video', x: 260, y: 820, inputs: ['FIBER IP'], outputs: ['SDI OP'],
    outputsMeta: { 'SDI OP': { connType: 'SDI' } } },
  { id: 'fiber_rx3', name: 'FIBER RX-3', type: 'video', x: 260, y: 920, inputs: ['FIBER IP'], outputs: ['SDI OP'],
    outputsMeta: { 'SDI OP': { connType: 'SDI' } } },

  // Col 3: CG / Replay / SSD / VMIX / VDA / DEMUX
  { id: 'cg1', name: 'CG-1', type: 'video', x: 500, y: 40, inputs: ['KEYBOARD'], outputs: ['FILL','KEY'],
    inputsMeta: { 'KEYBOARD': { connType: 'USB' } },
    outputsMeta: {
      'FILL': { label: 'VDA1-5A IP', connType: '12G-SDI' },
      'KEY': { label: 'VDA2-5A IP', connType: '12G-SDI' },
    } },
  { id: 'replay', name: 'Replay', model: 'Vieco', type: 'video', x: 500, y: 140, inputs: [], outputs: ['CH A','CH B'],
    outputsMeta: {
      'CH A': { label: 'VDA1-3B IP', connType: '12G-SDI' },
      'CH B': { label: 'VDA2-3B IP', connType: '12G-SDI' },
    } },
  { id: 'ssd_a', name: 'SSD PLAY/REC A', type: 'video', x: 500, y: 240, inputs: [], outputs: ['OP'],
    outputsMeta: { 'OP': { connType: '12G-SDI' } } },
  { id: 'ssd_b', name: 'SSD PLAY/REC B', type: 'video', x: 500, y: 320, inputs: [], outputs: ['OP'],
    outputsMeta: { 'OP': { connType: '12G-SDI' } } },
  { id: 'vmix', name: 'V-MIX', type: 'video', x: 500, y: 400, inputs: ['IN'], outputs: ['OP'],
    outputsMeta: { 'OP': { label: 'R/S IP-14', connType: 'SDI' } } },
  { id: 'vda1_1a', name: 'UHD VDA 1-1A', model: 'Cobalt Blue', type: 'video', role: 'splitter', x: 500, y: 500, inputs: ['IP'], outputs: ['OP-1','OP-2','OP-3','OP-4'],
    inputsMeta: { 'IP': { label: 'CCU-1 12G OP-1', connType: '12G-SDI' } },
    outputsMeta: { 'OP-1':{connType:'12G-SDI'},'OP-2':{connType:'12G-SDI'},'OP-3':{connType:'12G-SDI'},'OP-4':{connType:'12G-SDI'} } },
  { id: 'vda2_1a', name: 'UHD VDA 2-1A', model: 'Cobalt Blue', type: 'video', role: 'splitter', x: 500, y: 620, inputs: ['IP'], outputs: ['OP-1','OP-2','OP-3','OP-4'],
    inputsMeta: { 'IP': { connType: '12G-SDI' } },
    outputsMeta: { 'OP-1':{connType:'12G-SDI'},'OP-2':{connType:'12G-SDI'},'OP-3':{connType:'12G-SDI'},'OP-4':{connType:'12G-SDI'} } },
  { id: 'demux1', name: 'DEMUX-1', type: 'combined', x: 500, y: 760, inputs: ['UHD SDI'], outputs: ['AES1-4','VIDEO OUT'],
    inputsMeta: { 'UHD SDI': { label: 'From R/S OP-13', connType: '12G-SDI' } },
    outputsMeta: {
      'AES1-4': { label: 'AMU IP-5~8', connType: 'AES' },
      'VIDEO OUT': { connType: '12G-SDI' },
    } },
  { id: 'demux2', name: 'DEMUX-2', type: 'combined', x: 500, y: 860, inputs: ['UHD SDI'], outputs: ['AES1-4','VIDEO OUT'],
    outputsMeta: {
      'AES1-4': { connType: 'AES' },
      'VIDEO OUT': { connType: '12G-SDI' },
    } },

  // Col 4: 32x32 Router (big)
  { id: 'router', name: '32x32 라우팅 스위처', model: '32×32 R/S', type: 'video', role: 'router', x: 740, y: 40, width: 200,
    inputs: Array.from({length:32},(_,i)=>`IP${i+1}`),
    outputs: Array.from({length:32},(_,i)=>`OP${i+1}`),
    inputsMeta: {
      'IP1': { label: 'CAM-1 / CCU-1', connType: '12G-SDI' },
      'IP2': { label: 'CAM-2 / CCU-2', connType: '12G-SDI' },
      'IP3': { label: 'CAM-3 / CCU-3', connType: '12G-SDI' },
      'IP4': { label: 'CAM-4 / CCU-4', connType: '12G-SDI' },
      'IP5': { label: '중계석#1 CAM-1', connType: '12G-SDI' },
      'IP6': { label: '중계석#1 CAM-2', connType: '12G-SDI' },
      'IP11': { label: 'C/G FILL', connType: '12G-SDI' },
      'IP12': { label: 'C/G KEY', connType: '12G-SDI' },
      'IP13': { label: 'DEMUX-1', connType: '12G-SDI' },
      'IP14': { label: 'V-MIX', connType: 'SDI' },
      'IP15': { label: 'REPLAY CH A', connType: '12G-SDI' },
      'IP16': { label: 'REPLAY CH B / SSD-A', connType: '12G-SDI' },
      'IP17': { label: 'SSD PLAY/REC B', connType: '12G-SDI' },
      'IP27': { label: 'MAIN S/W PGM', connType: '12G-SDI' },
      'IP28': { label: 'MAIN S/W CLEAN', connType: '12G-SDI' },
      'IP30': { label: '프로마실 W/BOX', connType: '12G-SDI' },
      'IP31': { label: 'PC ZONE W/BOX', connType: '12G-SDI' },
    },
    outputsMeta: {
      'OP1': { label: 'MCU-1 (무대)', connType: '12G-SDI' },
      'OP2': { label: 'MCU-2 (입구)', connType: '12G-SDI' },
      'OP3': { label: 'REPLAY CH1 IP', connType: '12G-SDI' },
      'OP7': { label: 'TD DESK 18" MON', connType: '12G-SDI' },
      'OP8': { label: 'VD DESK 18" MON', connType: '12G-SDI' },
      'OP10': { label: 'AUDIO MON', connType: '12G-SDI' },
      'OP11': { label: 'MAIN S/W IP-21', connType: '12G-SDI' },
      'OP12': { label: 'MAIN S/W IP-22', connType: '12G-SDI' },
      'OP13': { label: 'MAIN S/W IP-23', connType: '12G-SDI' },
      'OP14': { label: 'MAIN S/W IP-24', connType: '12G-SDI' },
      'OP15': { label: 'SUB S/W IP-32', connType: '12G-SDI' },
      'OP16': { label: 'SUB S/W IP-33', connType: '12G-SDI' },
      'OP17': { label: 'A팀 W/BOX MON 1', connType: '12G-SDI' },
      'OP18': { label: 'A팀 W/BOX MON 2', connType: '12G-SDI' },
      'OP19': { label: 'B팀 W/BOX MON 1', connType: '12G-SDI' },
      'OP22': { label: 'A팀 선수석', connType: '12G-SDI' },
      'OP23': { label: 'B팀 선수석', connType: '12G-SDI' },
      'OP27': { label: 'MAIN PGM', connType: '12G-SDI' },
      'OP28': { label: 'MAIN CLEAN', connType: '12G-SDI' },
      'OP30': { label: '연결 송출 ENC IP-3', connType: '12G-SDI' },
      'OP31': { label: '녹화 송출 ENC IP-3', connType: '12G-SDI' },
      'OP32': { label: 'INGEST SVR IP-3', connType: '12G-SDI' },
    } },

  // Col 5: Main / Sub Switcher
  { id: 'mvs', name: 'Main Video Switcher', model: 'Sony XVS-G1', type: 'video', role: 'switcher', pgmPort: 'PGM 1', x: 980, y: 40, width: 210,
    inputs: Array.from({length:20},(_,i)=>`IP${i+1}`),
    outputs: ['PGM 1','PGM 2','CLEAN 1','CLEAN 2','PVW 1','AUX 1','AUX 2','AUX 3','AUX 4','AUX 5','AUX 6','M/V 1','M/V 2'],
    inputsMeta: {
      'IP1': { label: 'CAM 1', connType: '12G-SDI' },
      'IP2': { label: 'CAM 2', connType: '12G-SDI' },
      'IP3': { label: 'CAM 3', connType: '12G-SDI' },
      'IP4': { label: 'CAM 4', connType: '12G-SDI' },
      'IP5': { label: '중계석 CAM 1', connType: '12G-SDI' },
      'IP6': { label: '중계석 CAM 2', connType: '12G-SDI' },
      'IP10': { label: 'C/G FILL', connType: '12G-SDI' },
      'IP11': { label: 'C/G KEY', connType: '12G-SDI' },
      'IP14': { label: 'V-MIX', connType: '12G-SDI' },
      'IP15': { label: 'REPLAY CH A', connType: '12G-SDI' },
      'IP16': { label: 'REPLAY CH B', connType: '12G-SDI' },
    },
    outputsMeta: {
      'PGM 1': { label: 'VDA1-7 IP', connType: '12G-SDI' },
      'PGM 2': { connType: '12G-SDI' },
      'CLEAN 1': { label: 'VDA1-9 IP', connType: '12G-SDI' },
      'CLEAN 2': { connType: '12G-SDI' },
      'PVW 1': { label: 'MAIN PVW', connType: '12G-SDI' },
      'AUX 1': { connType: '12G-SDI' }, 'AUX 2': { connType: '12G-SDI' },
      'AUX 3': { connType: '12G-SDI' }, 'AUX 4': { connType: '12G-SDI' },
      'AUX 5': { connType: '12G-SDI' }, 'AUX 6': { connType: '12G-SDI' },
      'M/V 1': { connType: '12G-SDI' }, 'M/V 2': { connType: '12G-SDI' },
    } },
  { id: 'svs', name: 'Sub Video Switcher', model: 'BMD ATEM 4M/E', type: 'video', role: 'switcher', pgmPort: 'PGM', x: 980, y: 580, width: 210,
    inputs: Array.from({length:12},(_,i)=>`IP${i+1}`),
    outputs: ['PGM','CLEAN','PVW','AUX1','AUX2','AUX3','AUX4','AUX5'],
    inputsMeta: {
      'IP1': { label: 'CAM 1', connType: '12G-SDI' },
      'IP2': { label: 'CAM 2', connType: '12G-SDI' },
      'IP3': { label: 'CAM 3', connType: '12G-SDI' },
      'IP4': { label: 'CAM 4', connType: '12G-SDI' },
    },
    outputsMeta: Object.fromEntries(['PGM','CLEAN','PVW','AUX1','AUX2','AUX3','AUX4','AUX5'].map(p=>[p,{connType:'12G-SDI' as ConnectionType}])) },
  { id: 'mv_main', name: 'Main Multi-View', type: 'video', x: 980, y: 900,
    inputs: Array.from({length:8},(_,i)=>`IP${i+1}`),
    outputs: ['MV1','MV2','MV3','MV4'],
    outputsMeta: { 'MV1':{connType:'HDMI'},'MV2':{connType:'HDMI'},'MV3':{connType:'HDMI'},'MV4':{connType:'HDMI'} } },

  // Col 6: MUX / MCU
  { id: 'mux_pgm', name: 'MUX 1 (PGM Embedder)', type: 'combined', x: 1220, y: 40, inputs: ['VIDEO','AUDIO'], outputs: ['UHD SDI'],
    inputsMeta: { 'VIDEO': { connType: '12G-SDI' }, 'AUDIO': { connType: 'AES' } },
    outputsMeta: { 'UHD SDI': { connType: '12G-SDI' } } },
  { id: 'mux_clean', name: 'MUX 2 (CLEAN Embedder)', type: 'combined', x: 1220, y: 160, inputs: ['VIDEO','AUDIO'], outputs: ['UHD SDI'],
    inputsMeta: { 'VIDEO': { connType: '12G-SDI' }, 'AUDIO': { connType: 'AES' } },
    outputsMeta: { 'UHD SDI': { connType: '12G-SDI' } } },
  { id: 'mcu1', name: 'MCU-1 (주경기장 무대)', type: 'video', x: 1220, y: 300, inputs: ['SDI-1','SDI-2'], outputs: ['HDMI','LAN'],
    inputsMeta: { 'SDI-1': { connType: '12G-SDI' }, 'SDI-2': { connType: '12G-SDI' } },
    outputsMeta: { 'HDMI': { connType: 'HDMI' }, 'LAN': { connType: 'LAN' } } },
  { id: 'mcu2', name: 'MCU-2 (주경기장 입구)', type: 'video', x: 1220, y: 420, inputs: ['DVI-1','DVI-2'], outputs: ['HDMI','LAN'],
    inputsMeta: { 'DVI-1': { connType: 'DVI' }, 'DVI-2': { connType: 'DVI' } },
    outputsMeta: { 'HDMI': { connType: 'HDMI' }, 'LAN': { connType: 'LAN' } } },
  { id: 'mcu3', name: 'MCU-3 (주경기장 하단)', type: 'video', x: 1220, y: 540, inputs: ['DVI-1','DVI-2'], outputs: ['HDMI','LAN'],
    inputsMeta: { 'DVI-1': { connType: 'DVI' }, 'DVI-2': { connType: 'DVI' } },
    outputsMeta: { 'HDMI': { connType: 'HDMI' }, 'LAN': { connType: 'LAN' } } },
  { id: 'mv_mon1', name: 'Multi-View Mon 1 (음저버)', type: 'video', x: 1220, y: 700, inputs: ['MV'], outputs: [],
    inputsMeta: { 'MV': { connType: 'HDMI' } } },
  { id: 'mv_mon2', name: 'Multi-View Mon 2 (부조)', type: 'video', x: 1220, y: 780, inputs: ['MV'], outputs: [],
    inputsMeta: { 'MV': { connType: 'HDMI' } } },
  { id: 'mv_mon3', name: 'Multi-View Mon 3 (부조)', type: 'video', x: 1220, y: 860, inputs: ['MV'], outputs: [],
    inputsMeta: { 'MV': { connType: 'HDMI' } } },
  { id: 'mv_mon4', name: 'Multi-View Mon 4 (부조)', type: 'video', x: 1220, y: 940, inputs: ['MV'], outputs: [],
    inputsMeta: { 'MV': { connType: 'HDMI' } } },

  // Col 7: Final Outputs
  { id: 'led_stage', name: '주경기장 무대 LED', type: 'video', x: 1460, y: 40, inputs: ['HDMI'], outputs: [],
    inputsMeta: { 'HDMI': { connType: 'HDMI' } } },
  { id: 'led_entry', name: '주경기장 입구 LED', type: 'video', x: 1460, y: 140, inputs: ['HDMI'], outputs: [],
    inputsMeta: { 'HDMI': { connType: 'HDMI' } } },
  { id: 'led_bottom', name: '주경기장 하단 LED', type: 'video', x: 1460, y: 240, inputs: ['HDMI'], outputs: [],
    inputsMeta: { 'HDMI': { connType: 'HDMI' } } },
  { id: 'main_pgm', name: 'MAIN PGM 송출', type: 'combined', x: 1460, y: 360, inputs: ['SDI-1','SDI-2','SDI-3'], outputs: [],
    inputsMeta: { 'SDI-1': { connType: '12G-SDI' },'SDI-2':{connType:'12G-SDI'},'SDI-3':{connType:'12G-SDI'} } },
  { id: 'main_clean', name: 'MAIN CLEAN 송출', type: 'combined', x: 1460, y: 480, inputs: ['SDI-1','SDI-2','SDI-3'], outputs: [],
    inputsMeta: { 'SDI-1': { connType: '12G-SDI' },'SDI-2':{connType:'12G-SDI'},'SDI-3':{connType:'12G-SDI'} } },
  { id: 'main_pvw', name: 'MAIN PVW', type: 'video', x: 1460, y: 600, inputs: ['SDI-1','SDI-2'], outputs: [],
    inputsMeta: { 'SDI-1': { connType: 'SDI' },'SDI-2': { connType: 'SDI' } } },
  { id: 'ingest_svr', name: 'INGEST SVR', type: 'combined', x: 1460, y: 680, inputs: ['SDI-1','SDI-2','SDI-3'], outputs: [],
    inputsMeta: { 'SDI-1':{connType:'12G-SDI'},'SDI-2':{connType:'12G-SDI'},'SDI-3':{connType:'12G-SDI'} } },
  { id: 'td_desk', name: 'TD DESK (18" MON)', type: 'video', x: 1460, y: 790, inputs: ['MON'], outputs: [],
    inputsMeta: { 'MON': { connType: '12G-SDI' } } },
  { id: 'video_desk', name: 'VIDEO DESK (18" MON)', type: 'video', x: 1460, y: 860, inputs: ['MON'], outputs: [],
    inputsMeta: { 'MON': { connType: '12G-SDI' } } },
  { id: 'audio_desk', name: 'AUDIO DESK (MON)', type: 'video', x: 1460, y: 930, inputs: ['MON'], outputs: [],
    inputsMeta: { 'MON': { connType: '12G-SDI' } } },
  { id: 'player_a', name: 'A팀 선수석 WALL BOX', type: 'video', role: 'wallbox', location: 'A팀 선수석', roomNumber: 'WB-PA', x: 1460, y: 1020, width: 210,
    inputs: ['MON1','MON2','MON3','MON4','MON5','MON6'], outputs: [],
    inputsMeta: Object.fromEntries(['MON1','MON2','MON3','MON4','MON5','MON6'].map(p=>[p,{label:`A팀 POV`, connType:'12G-SDI' as ConnectionType}])) },
  { id: 'player_b', name: 'B팀 선수석 WALL BOX', type: 'video', role: 'wallbox', location: 'B팀 선수석', roomNumber: 'WB-PB', x: 1460, y: 1230, width: 210,
    inputs: ['MON1','MON2','MON3','MON4','MON5','MON6'], outputs: [],
    inputsMeta: Object.fromEntries(['MON1','MON2','MON3','MON4','MON5','MON6'].map(p=>[p,{label:`B팀 POV`, connType:'12G-SDI' as ConnectionType}])) },
  { id: 'standby1', name: '선수대기실-1 65" MON', type: 'video', x: 1700, y: 40, inputs: ['HDMI'], outputs: [],
    inputsMeta: { 'HDMI': { connType: 'HDMI' } } },
  { id: 'standby2', name: '선수대기실-2 65" MON', type: 'video', x: 1700, y: 120, inputs: ['HDMI'], outputs: [],
    inputsMeta: { 'HDMI': { connType: 'HDMI' } } },
  { id: 'standby3', name: '선수대기실-3 65" MON', type: 'video', x: 1700, y: 200, inputs: ['HDMI'], outputs: [],
    inputsMeta: { 'HDMI': { connType: 'HDMI' } } },
  { id: 'enc_live', name: '연결 송출 ENC', type: 'combined', x: 1700, y: 300, inputs: ['SDI'], outputs: ['IP OUT'],
    inputsMeta: { 'SDI': { connType: '12G-SDI' } },
    outputsMeta: { 'IP OUT': { connType: 'IP' } } },
  { id: 'enc_rec', name: '녹화 송출 ENC', type: 'combined', x: 1700, y: 400, inputs: ['SDI'], outputs: ['IP OUT'],
    inputsMeta: { 'SDI': { connType: '12G-SDI' } },
    outputsMeta: { 'IP OUT': { connType: 'IP' } } },

  // ===== Video Patchbay (BNC 24 x 2) =====
  // 물리 패치베이 - 기본은 1:1 normal-thru, 앞면 패치로 오버라이드 가능
  { id: 'vpatch_1', name: 'Video Patchbay #1', model: 'ADC PPS3 · BNC 24×2', type: 'video', role: 'patchbay', x: 1220, y: 1080, width: 300,
    inputs:  Array.from({length:24}, (_,i)=>`IN-${String(i+1).padStart(2,'0')}`),
    outputs: Array.from({length:24}, (_,i)=>`OUT-${String(i+1).padStart(2,'0')}`),
    inputsMeta: Object.fromEntries(Array.from({length:24},(_,i)=>{
      const k=`IN-${String(i+1).padStart(2,'0')}`;
      return [k,{ connType: '12G-SDI' as ConnectionType, layerId:'layer_video' }];
    })),
    outputsMeta: Object.fromEntries(Array.from({length:24},(_,i)=>{
      const k=`OUT-${String(i+1).padStart(2,'0')}`;
      return [k,{ connType: '12G-SDI' as ConnectionType, layerId:'layer_video' }];
    })),
    // 기본은 모두 1:1 normal-thru
    normals: Object.fromEntries(Array.from({length:24},(_,i)=>[
      `IN-${String(i+1).padStart(2,'0')}`, `OUT-${String(i+1).padStart(2,'0')}`,
    ])),
  },
];

const audioDevices: DeviceSeed[] = [
  // Col 1 Audio Sources
  { id: 'wl_mic1', name: 'W/L MIC-1 (주경기장)', type: 'audio', x: 40, y: 1460, inputs: [], outputs: ['ANT'],
    outputsMeta: { 'ANT': { connType: 'ANALOG' } } },
  { id: 'wl_mic2', name: 'W/L MIC-2', type: 'audio', x: 40, y: 1540, inputs: [], outputs: ['ANT'],
    outputsMeta: { 'ANT': { connType: 'ANALOG' } } },
  { id: 'wl_mic3', name: 'W/L MIC-3', type: 'audio', x: 40, y: 1620, inputs: [], outputs: ['ANT'],
    outputsMeta: { 'ANT': { connType: 'ANALOG' } } },
  { id: 'wl_mic4', name: 'W/L MIC-4', type: 'audio', x: 40, y: 1700, inputs: [], outputs: ['ANT'],
    outputsMeta: { 'ANT': { connType: 'ANALOG' } } },
  { id: 'mic_wb1', name: '주경기장 W/BOX-1 MIC', type: 'audio', role: 'wallbox', location: '주경기장', roomNumber: 'WB-M1', x: 40, y: 1820, width: 200,
    inputs: [], outputs: ['MIC1','MIC2','MIC3','MIC4'],
    outputsMeta: Object.fromEntries(['MIC1','MIC2','MIC3','MIC4'].map((p,i)=>[p,{label:`AMU MIC/LINE IP-${i+1}`, connType:'XLR' as ConnectionType}])) },
  { id: 'mic_wb2', name: '주경기장 W/BOX-2 MIC', type: 'audio', role: 'wallbox', location: '주경기장', roomNumber: 'WB-M2', x: 40, y: 1980, width: 200,
    inputs: [], outputs: ['MIC1','MIC2'],
    outputsMeta: { 'MIC1':{connType:'XLR'},'MIC2':{connType:'XLR'} } },
  { id: 'mic_obs', name: '중계석#1 W/BOX MIC', type: 'audio', role: 'wallbox', location: '중계석#1', roomNumber: 'OBS-01', x: 40, y: 2100, width: 200,
    inputs: [], outputs: ['MIC1','MIC2','MIC3'],
    outputsMeta: { 'MIC1':{connType:'XLR'},'MIC2':{connType:'XLR'},'MIC3':{connType:'XLR'} } },
  { id: 'mic_cr', name: '크로마실 MIC', type: 'audio', role: 'wallbox', location: '크로마실', roomNumber: 'CR-01', x: 40, y: 2240, width: 200,
    inputs: [], outputs: ['MIC1','MIC2'],
    outputsMeta: { 'MIC1':{connType:'XLR'},'MIC2':{connType:'XLR'} } },
  { id: 'mic_pc', name: 'PC 존 MIC', type: 'audio', role: 'wallbox', location: 'PC 존', roomNumber: 'PC-01', x: 40, y: 2360, width: 200,
    inputs: [], outputs: ['MIC1','MIC2'],
    outputsMeta: { 'MIC1':{connType:'XLR'},'MIC2':{connType:'XLR'} } },

  // Col 2 Audio: Receivers / DI Box
  { id: 'wl_rx1', name: 'W/L Receiver-1', type: 'audio', x: 260, y: 1460, inputs: ['ANT-A','ANT-B'], outputs: ['AES'],
    inputsMeta: { 'ANT-A': { connType: 'ANALOG' }, 'ANT-B': { connType: 'ANALOG' } },
    outputsMeta: { 'AES': { label: 'AMU AES IP-1', connType: 'AES' } } },
  { id: 'wl_rx2', name: 'W/L Receiver-2', type: 'audio', x: 260, y: 1540, inputs: ['ANT-A','ANT-B'], outputs: ['AES'],
    outputsMeta: { 'AES': { connType: 'AES' } } },
  { id: 'wl_rx3', name: 'W/L Receiver-3', type: 'audio', x: 260, y: 1620, inputs: ['ANT-A','ANT-B'], outputs: ['AES'],
    outputsMeta: { 'AES': { connType: 'AES' } } },
  { id: 'wl_rx4', name: 'W/L Receiver-4', type: 'audio', x: 260, y: 1700, inputs: ['ANT-A','ANT-B'], outputs: ['AES'],
    outputsMeta: { 'AES': { connType: 'AES' } } },
  { id: 'dibox1', name: 'DI BOX-1 (음저버-1)', type: 'audio', x: 260, y: 1820, inputs: ['USB'], outputs: ['CH1','CH2'],
    inputsMeta: { 'USB': { connType: 'USB' } },
    outputsMeta: { 'CH1':{connType:'ANALOG'},'CH2':{connType:'ANALOG'} } },
  { id: 'dibox2', name: 'DI BOX-2 (음저버-2)', type: 'audio', x: 260, y: 1920, inputs: ['USB'], outputs: ['CH1','CH2'],
    inputsMeta: { 'USB': { connType: 'USB' } },
    outputsMeta: { 'CH1':{connType:'ANALOG'},'CH2':{connType:'ANALOG'} } },
  { id: 'dibox3', name: 'DI BOX-3 (음저버-3)', type: 'audio', x: 260, y: 2020, inputs: ['USB'], outputs: ['CH1','CH2'],
    inputsMeta: { 'USB': { connType: 'USB' } },
    outputsMeta: { 'CH1':{connType:'ANALOG'},'CH2':{connType:'ANALOG'} } },
  { id: 'dibox4', name: 'DI BOX-4 (음저버-4)', type: 'audio', x: 260, y: 2120, inputs: ['USB'], outputs: ['CH1','CH2'],
    inputsMeta: { 'USB': { connType: 'USB' } },
    outputsMeta: { 'CH1':{connType:'ANALOG'},'CH2':{connType:'ANALOG'} } },
  { id: 'dibox_vmix', name: 'DI BOX V-MIX', type: 'audio', x: 260, y: 2220, inputs: ['USB'], outputs: ['CH1','CH2'],
    inputsMeta: { 'USB': { connType: 'USB' } },
    outputsMeta: { 'CH1':{connType:'ANALOG'},'CH2':{connType:'ANALOG'} } },
  { id: 'dibox_note', name: 'DI BOX (음성 노트북)', type: 'audio', x: 260, y: 2320, inputs: ['USB'], outputs: ['CH1','CH2'],
    outputsMeta: { 'CH1':{connType:'ANALOG'},'CH2':{connType:'ANALOG'} } },

  // Col 3 Audio
  { id: 'cdp1', name: 'CDP-1', type: 'audio', x: 500, y: 1460, inputs: [], outputs: ['CH1','CH2'],
    outputsMeta: { 'CH1':{connType:'AES'},'CH2':{connType:'AES'} } },
  { id: 'opt4ch', name: '4 IN / 8 OUT Digital Option Card', type: 'audio', x: 500, y: 1580, width: 220,
    inputs: ['AES IN-1','AES IN-2','AES IN-3','AES IN-4'],
    outputs: ['AES OUT-1','AES OUT-2','AES OUT-3','AES OUT-4','AES OUT-5','AES OUT-6','AES OUT-7','AES OUT-8'],
    inputsMeta: Object.fromEntries(['AES IN-1','AES IN-2','AES IN-3','AES IN-4'].map(p=>[p,{connType:'AES' as ConnectionType}])),
    outputsMeta: Object.fromEntries(['AES OUT-1','AES OUT-2','AES OUT-3','AES OUT-4','AES OUT-5','AES OUT-6','AES OUT-7','AES OUT-8'].map(p=>[p,{connType:'AES' as ConnectionType}])) },

  // Col 4 Audio: Digital Audio Mixer AVANTIS 48CH
  { id: 'amu', name: '디지털 오디오 믹서', model: 'Allen & Heath AVANTIS 48/16', type: 'audio', role: 'switcher', pgmPort: 'PGM L', x: 740, y: 1460, width: 260,
    inputs: Array.from({length:48},(_,i)=>`CH${i+1}`),
    outputs: ['BUS1','BUS2','BUS3','BUS4','BUS5','BUS6','BUS7','BUS8','AUX1','AUX2','AUX3','AUX4','PGM L','PGM R','CLEAN L','CLEAN R','MON L','MON R'],
    inputsMeta: {
      'CH1': { label: 'W/L-1 AES', connType: 'AES' },
      'CH2': { label: 'W/L-2 AES', connType: 'AES' },
      'CH3': { label: 'W/L-3 AES', connType: 'AES' },
      'CH4': { label: 'W/L-4 AES', connType: 'AES' },
      'CH5': { label: 'CDP-1 L', connType: 'AES' },
      'CH6': { label: 'CDP-1 R', connType: 'AES' },
      'CH7': { label: 'DEMUX-1 CH1', connType: 'AES' },
      'CH8': { label: 'DEMUX-1 CH2', connType: 'AES' },
      'CH9': { label: 'DEMUX-2 CH1', connType: 'AES' },
      'CH10': { label: 'DEMUX-2 CH2', connType: 'AES' },
      'CH13': { label: 'W/BOX-1 MIC 1', connType: 'XLR' },
      'CH14': { label: 'W/BOX-1 MIC 2', connType: 'XLR' },
      'CH15': { label: 'W/BOX-1 MIC 3', connType: 'XLR' },
      'CH16': { label: 'W/BOX-1 MIC 4', connType: 'XLR' },
      'CH17': { label: 'W/BOX-2 MIC 1', connType: 'XLR' },
      'CH18': { label: 'W/BOX-2 MIC 2', connType: 'XLR' },
      'CH19': { label: '중계석 MIC 1', connType: 'XLR' },
      'CH20': { label: '중계석 MIC 2', connType: 'XLR' },
      'CH21': { label: '중계석 MIC 3', connType: 'XLR' },
      'CH22': { label: '크로마실 MIC 1', connType: 'XLR' },
      'CH23': { label: '크로마실 MIC 2', connType: 'XLR' },
      'CH24': { label: 'PC ZONE MIC 1', connType: 'XLR' },
      'CH25': { label: 'PC ZONE MIC 2', connType: 'XLR' },
      'CH26': { label: 'DI BOX-1 CH1', connType: 'ANALOG' },
      'CH27': { label: 'DI BOX-1 CH2', connType: 'ANALOG' },
      'CH28': { label: 'DI BOX-2 CH1', connType: 'ANALOG' },
      'CH29': { label: 'DI BOX-2 CH2', connType: 'ANALOG' },
      'CH30': { label: 'DI BOX-3', connType: 'ANALOG' },
      'CH31': { label: 'DI BOX-4', connType: 'ANALOG' },
      'CH32': { label: 'DI BOX V-MIX', connType: 'ANALOG' },
    },
    outputsMeta: {
      'BUS1': { label: '기존 PA MIXER', connType: 'AES' },
      'BUS2': { label: '주경기장 W/BOX-1 PA', connType: 'AES' },
      'BUS3': { label: '주경기장 W/BOX-2 PA', connType: 'AES' },
      'BUS4': { label: '보조경기장 PA', connType: 'AES' },
      'AUX1': { label: 'INTERCOM', connType: 'AES' },
      'AUX2': { label: 'ADA 3-6', connType: 'AES' },
      'AUX3': { label: 'ADA 3-7', connType: 'AES' },
      'AUX4': { label: 'Dante Network', connType: 'DANTE' },
      'PGM L': { label: 'MUX 1', connType: 'AES' },
      'PGM R': { label: 'MUX 1', connType: 'AES' },
      'CLEAN L': { label: 'MUX 2', connType: 'AES' },
      'CLEAN R': { label: 'MUX 2', connType: 'AES' },
      'MON L': { label: 'C/R Speaker L', connType: 'AES' },
      'MON R': { label: 'C/R Speaker R', connType: 'AES' },
    } },
  { id: 'mic_rack', name: '디지털 마이크 랙', model: 'Allen & Heath GX4816', type: 'audio', x: 740, y: 2350, width: 260,
    inputs: ['IN 1-16','IN 17-32','IN 33-48'], outputs: ['DANTE OUT'],
    inputsMeta: { 'IN 1-16':{connType:'XLR'}, 'IN 17-32':{connType:'XLR'}, 'IN 33-48':{connType:'XLR'} },
    outputsMeta: { 'DANTE OUT': { connType: 'DANTE' } } },

  // Col 5 Audio: Dante / ADA / Intercom
  { id: 'dante_sw1', name: 'Dante Network SW#1', model: 'Primary', type: 'audio', x: 1020, y: 1460, width: 220,
    inputs: ['AMU OUT','MIC RACK','AES IN','IP BACKUP'],
    outputs: ['AMU IN','W/L Rx','ADA','MONITOR'],
    inputsMeta: { 'AMU OUT':{connType:'DANTE'},'MIC RACK':{connType:'DANTE'},'AES IN':{connType:'DANTE'},'IP BACKUP':{connType:'LAN'} },
    outputsMeta: { 'AMU IN':{connType:'DANTE'},'W/L Rx':{connType:'DANTE'},'ADA':{connType:'DANTE'},'MONITOR':{connType:'DANTE'} } },
  { id: 'dante_sw2', name: 'Dante Network SW#2', model: 'Backup', type: 'audio', x: 1020, y: 1660, width: 220,
    inputs: ['AMU OUT','MIC RACK','AES IN','IP PRIMARY'],
    outputs: ['AMU IN','W/L Rx','ADA','MONITOR'],
    inputsMeta: { 'AMU OUT':{connType:'DANTE'},'MIC RACK':{connType:'DANTE'},'AES IN':{connType:'DANTE'},'IP PRIMARY':{connType:'LAN'} },
    outputsMeta: { 'AMU IN':{connType:'DANTE'},'W/L Rx':{connType:'DANTE'},'ADA':{connType:'DANTE'},'MONITOR':{connType:'DANTE'} } },
  { id: 'ada36', name: 'Analog ADA 3-6', type: 'audio', x: 1020, y: 1880, inputs: ['IP'], outputs: ['OP-1','OP-2','OP-3','OP-4','OP-5','OP-6'],
    inputsMeta: { 'IP': { connType: 'DANTE' } },
    outputsMeta: Object.fromEntries(['OP-1','OP-2','OP-3','OP-4','OP-5','OP-6'].map(p=>[p,{connType:'ANALOG' as ConnectionType}])) },
  { id: 'ada37', name: 'Analog ADA 3-7', type: 'audio', x: 1020, y: 2100, inputs: ['IP'], outputs: ['OP-1','OP-2','OP-3','OP-4'],
    inputsMeta: { 'IP': { connType: 'DANTE' } },
    outputsMeta: Object.fromEntries(['OP-1','OP-2','OP-3','OP-4'].map(p=>[p,{connType:'ANALOG' as ConnectionType}])) },
  { id: 'intercom', name: 'INTERCOM', model: 'CLEAR-COM', type: 'audio', x: 1020, y: 2300, width: 220,
    inputs: ['CH1','CH2','CH3','CH4'], outputs: ['BP 1','BP 2','BP 3'],
    inputsMeta: { 'CH1':{connType:'AES'},'CH2':{connType:'AES'},'CH3':{connType:'AES'},'CH4':{connType:'AES'} },
    outputsMeta: { 'BP 1':{connType:'ANALOG'},'BP 2':{connType:'ANALOG'},'BP 3':{connType:'ANALOG'} } },

  // Col 6 Audio Outputs
  { id: 'pa_main', name: '기존 PA MIXER', type: 'audio', x: 1280, y: 1460, inputs: ['AES'], outputs: [],
    inputsMeta: { 'AES': { connType: 'AES' } } },
  { id: 'pa_wb1', name: '주경기장 W/BOX-1 PA', type: 'audio', x: 1280, y: 1560, inputs: ['AES'], outputs: [],
    inputsMeta: { 'AES': { connType: 'AES' } } },
  { id: 'pa_wb2', name: '주경기장 W/BOX-2 PA', type: 'audio', x: 1280, y: 1660, inputs: ['AES'], outputs: [],
    inputsMeta: { 'AES': { connType: 'AES' } } },
  { id: 'pa_obs', name: '보조경기장 부조정실 PA', type: 'audio', x: 1280, y: 1760, inputs: ['AES'], outputs: [],
    inputsMeta: { 'AES': { connType: 'AES' } } },
  { id: 'cr_speaker_l', name: 'C/R Speaker L', type: 'audio', x: 1280, y: 1860, inputs: ['AES'], outputs: [],
    inputsMeta: { 'AES': { connType: 'AES' } } },
  { id: 'cr_speaker_r', name: 'C/R Speaker R', type: 'audio', x: 1280, y: 1940, inputs: ['AES'], outputs: [],
    inputsMeta: { 'AES': { connType: 'AES' } } },
  { id: 'audio_mon', name: 'AUDIO Monitor', type: 'audio', x: 1280, y: 2020, inputs: ['AES-L','AES-R'], outputs: [],
    inputsMeta: { 'AES-L': { connType: 'AES' }, 'AES-R': { connType: 'AES' } } },
  { id: 'tally', name: 'Tally Switch', type: 'combined', x: 1280, y: 2140, inputs: ['GPO'], outputs: [],
    inputsMeta: { 'GPO': { label: 'ON-AIR LAMP', connType: 'GPIO' } } },

  // ===== Audio Patchbay (XLR 24 x 2 / TT Bantam) =====
  { id: 'apatch_1', name: 'Audio Patchbay', model: 'TT Bantam · XLR 24×2', type: 'audio', role: 'patchbay', x: 1520, y: 1580, width: 300,
    inputs:  Array.from({length:24}, (_,i)=>`IN-${String(i+1).padStart(2,'0')}`),
    outputs: Array.from({length:24}, (_,i)=>`OUT-${String(i+1).padStart(2,'0')}`),
    inputsMeta: Object.fromEntries(Array.from({length:24},(_,i)=>{
      const k=`IN-${String(i+1).padStart(2,'0')}`;
      return [k,{ connType: 'XLR' as ConnectionType, layerId:'layer_audio' }];
    })),
    outputsMeta: Object.fromEntries(Array.from({length:24},(_,i)=>{
      const k=`OUT-${String(i+1).padStart(2,'0')}`;
      return [k,{ connType: 'XLR' as ConnectionType, layerId:'layer_audio' }];
    })),
    normals: Object.fromEntries(Array.from({length:24},(_,i)=>[
      `IN-${String(i+1).padStart(2,'0')}`, `OUT-${String(i+1).padStart(2,'0')}`,
    ])),
  },
];

// Connections
export const INITIAL_CONNECTIONS = [
  // CAM → CCU
  { from_device: 'cam1', from_port: 'SDI', to_device: 'ccu1', to_port: 'FIBER IP', conn_type: 'FIBER' as ConnectionType },
  { from_device: 'cam2', from_port: 'SDI', to_device: 'ccu2', to_port: 'FIBER IP', conn_type: 'FIBER' as ConnectionType },
  { from_device: 'cam3', from_port: 'SDI', to_device: 'ccu3', to_port: 'FIBER IP', conn_type: 'FIBER' as ConnectionType },
  { from_device: 'cam4', from_port: 'SDI', to_device: 'ccu4', to_port: 'FIBER IP', conn_type: 'FIBER' as ConnectionType },
  // CCU → VDA & Router
  { from_device: 'ccu1', from_port: '12G OP-1', to_device: 'vda1_1a', to_port: 'IP', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'ccu1', from_port: '12G OP-2', to_device: 'vda2_1a', to_port: 'IP', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'ccu1', from_port: '12G OP-3', to_device: 'router', to_port: 'IP1', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'ccu2', from_port: '12G OP-3', to_device: 'router', to_port: 'IP2', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'ccu3', from_port: '12G OP-3', to_device: 'router', to_port: 'IP3', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'ccu4', from_port: '12G OP-3', to_device: 'router', to_port: 'IP4', conn_type: '12G-SDI' as ConnectionType },
  // PTZ, Fiber
  { from_device: 'ptz1', from_port: 'SDI', to_device: 'router', to_port: 'IP5', conn_type: 'SDI' as ConnectionType },
  { from_device: 'ptz2', from_port: 'SDI', to_device: 'router', to_port: 'IP6', conn_type: 'SDI' as ConnectionType },
  { from_device: 'ptz3', from_port: 'SDI', to_device: 'router', to_port: 'IP7', conn_type: 'SDI' as ConnectionType },
  { from_device: 'fiber_tx1', from_port: 'FIBER OP', to_device: 'fiber_rx1', to_port: 'FIBER IP', conn_type: 'FIBER' as ConnectionType },
  { from_device: 'fiber_tx2', from_port: 'FIBER OP', to_device: 'fiber_rx2', to_port: 'FIBER IP', conn_type: 'FIBER' as ConnectionType },
  { from_device: 'fiber_tx3', from_port: 'FIBER OP', to_device: 'fiber_rx3', to_port: 'FIBER IP', conn_type: 'FIBER' as ConnectionType },
  // Sources → Router
  { from_device: 'cg1', from_port: 'FILL', to_device: 'router', to_port: 'IP11', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'cg1', from_port: 'KEY', to_device: 'router', to_port: 'IP12', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'replay', from_port: 'CH A', to_device: 'router', to_port: 'IP15', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'replay', from_port: 'CH B', to_device: 'router', to_port: 'IP16', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'ssd_b', from_port: 'OP', to_device: 'router', to_port: 'IP17', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'vmix', from_port: 'OP', to_device: 'router', to_port: 'IP14', conn_type: 'SDI' as ConnectionType },
  { from_device: 'demux1', from_port: 'VIDEO OUT', to_device: 'router', to_port: 'IP13', conn_type: '12G-SDI' as ConnectionType },
  // Router → Main Switcher
  { from_device: 'router', from_port: 'OP11', to_device: 'mvs', to_port: 'IP1', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'router', from_port: 'OP12', to_device: 'mvs', to_port: 'IP2', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'router', from_port: 'OP13', to_device: 'mvs', to_port: 'IP3', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'router', from_port: 'OP14', to_device: 'mvs', to_port: 'IP4', conn_type: '12G-SDI' as ConnectionType },
  // Router → Sub Switcher
  { from_device: 'router', from_port: 'OP15', to_device: 'svs', to_port: 'IP1', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'router', from_port: 'OP16', to_device: 'svs', to_port: 'IP2', conn_type: '12G-SDI' as ConnectionType },
  // Router → MCU
  { from_device: 'router', from_port: 'OP1', to_device: 'mcu1', to_port: 'SDI-1', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'router', from_port: 'OP2', to_device: 'mcu2', to_port: 'DVI-1', conn_type: '12G-SDI' as ConnectionType },
  // Router → Desks
  { from_device: 'router', from_port: 'OP7', to_device: 'td_desk', to_port: 'MON', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'router', from_port: 'OP8', to_device: 'video_desk', to_port: 'MON', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'router', from_port: 'OP10', to_device: 'audio_desk', to_port: 'MON', conn_type: '12G-SDI' as ConnectionType },
  // Router → Player walls
  { from_device: 'router', from_port: 'OP17', to_device: 'player_a', to_port: 'MON1', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'router', from_port: 'OP18', to_device: 'player_a', to_port: 'MON2', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'router', from_port: 'OP19', to_device: 'player_b', to_port: 'MON1', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'router', from_port: 'OP22', to_device: 'player_a', to_port: 'MON3', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'router', from_port: 'OP23', to_device: 'player_b', to_port: 'MON2', conn_type: '12G-SDI' as ConnectionType },
  // Router → ENC / INGEST
  { from_device: 'router', from_port: 'OP30', to_device: 'enc_live', to_port: 'SDI', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'router', from_port: 'OP31', to_device: 'enc_rec', to_port: 'SDI', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'router', from_port: 'OP32', to_device: 'ingest_svr', to_port: 'SDI-3', conn_type: '12G-SDI' as ConnectionType },
  // MCU → LED
  { from_device: 'mcu1', from_port: 'HDMI', to_device: 'led_stage', to_port: 'HDMI', conn_type: 'HDMI' as ConnectionType },
  { from_device: 'mcu2', from_port: 'HDMI', to_device: 'led_entry', to_port: 'HDMI', conn_type: 'HDMI' as ConnectionType },
  { from_device: 'mcu3', from_port: 'HDMI', to_device: 'led_bottom', to_port: 'HDMI', conn_type: 'HDMI' as ConnectionType },
  // Switcher → MUX
  { from_device: 'mvs', from_port: 'PGM 1', to_device: 'mux_pgm', to_port: 'VIDEO', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'mvs', from_port: 'CLEAN 1', to_device: 'mux_clean', to_port: 'VIDEO', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'mvs', from_port: 'PVW 1', to_device: 'main_pvw', to_port: 'SDI-1', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'mvs', from_port: 'M/V 1', to_device: 'mv_main', to_port: 'IP1', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'mvs', from_port: 'M/V 2', to_device: 'mv_main', to_port: 'IP2', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'mvs', from_port: 'PGM 1', to_device: 'router', to_port: 'IP27', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'mvs', from_port: 'CLEAN 1', to_device: 'router', to_port: 'IP28', conn_type: '12G-SDI' as ConnectionType },
  // MUX → Final
  { from_device: 'mux_pgm', from_port: 'UHD SDI', to_device: 'main_pgm', to_port: 'SDI-1', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'mux_pgm', from_port: 'UHD SDI', to_device: 'ingest_svr', to_port: 'SDI-1', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'mux_clean', from_port: 'UHD SDI', to_device: 'main_clean', to_port: 'SDI-1', conn_type: '12G-SDI' as ConnectionType },
  { from_device: 'mux_clean', from_port: 'UHD SDI', to_device: 'ingest_svr', to_port: 'SDI-2', conn_type: '12G-SDI' as ConnectionType },
  // MV
  { from_device: 'mv_main', from_port: 'MV1', to_device: 'mv_mon1', to_port: 'MV', conn_type: 'HDMI' as ConnectionType },
  { from_device: 'mv_main', from_port: 'MV2', to_device: 'mv_mon2', to_port: 'MV', conn_type: 'HDMI' as ConnectionType },
  { from_device: 'mv_main', from_port: 'MV3', to_device: 'mv_mon3', to_port: 'MV', conn_type: 'HDMI' as ConnectionType },
  { from_device: 'mv_main', from_port: 'MV4', to_device: 'mv_mon4', to_port: 'MV', conn_type: 'HDMI' as ConnectionType },
  // DEMUX audio
  { from_device: 'demux1', from_port: 'AES1-4', to_device: 'amu', to_port: 'CH7', conn_type: 'AES' as ConnectionType },
  { from_device: 'demux2', from_port: 'AES1-4', to_device: 'amu', to_port: 'CH9', conn_type: 'AES' as ConnectionType },

  // AUDIO
  { from_device: 'wl_mic1', from_port: 'ANT', to_device: 'wl_rx1', to_port: 'ANT-A', conn_type: 'ANALOG' as ConnectionType },
  { from_device: 'wl_mic2', from_port: 'ANT', to_device: 'wl_rx2', to_port: 'ANT-A', conn_type: 'ANALOG' as ConnectionType },
  { from_device: 'wl_mic3', from_port: 'ANT', to_device: 'wl_rx3', to_port: 'ANT-A', conn_type: 'ANALOG' as ConnectionType },
  { from_device: 'wl_mic4', from_port: 'ANT', to_device: 'wl_rx4', to_port: 'ANT-A', conn_type: 'ANALOG' as ConnectionType },
  { from_device: 'wl_rx1', from_port: 'AES', to_device: 'amu', to_port: 'CH1', conn_type: 'AES' as ConnectionType },
  { from_device: 'wl_rx2', from_port: 'AES', to_device: 'amu', to_port: 'CH2', conn_type: 'AES' as ConnectionType },
  { from_device: 'wl_rx3', from_port: 'AES', to_device: 'amu', to_port: 'CH3', conn_type: 'AES' as ConnectionType },
  { from_device: 'wl_rx4', from_port: 'AES', to_device: 'amu', to_port: 'CH4', conn_type: 'AES' as ConnectionType },
  { from_device: 'cdp1', from_port: 'CH1', to_device: 'opt4ch', to_port: 'AES IN-1', conn_type: 'AES' as ConnectionType },
  { from_device: 'cdp1', from_port: 'CH2', to_device: 'opt4ch', to_port: 'AES IN-2', conn_type: 'AES' as ConnectionType },
  { from_device: 'opt4ch', from_port: 'AES OUT-1', to_device: 'amu', to_port: 'CH5', conn_type: 'AES' as ConnectionType },
  { from_device: 'opt4ch', from_port: 'AES OUT-2', to_device: 'amu', to_port: 'CH6', conn_type: 'AES' as ConnectionType },
  { from_device: 'mic_wb1', from_port: 'MIC1', to_device: 'amu', to_port: 'CH13', conn_type: 'XLR' as ConnectionType },
  { from_device: 'mic_wb1', from_port: 'MIC2', to_device: 'amu', to_port: 'CH14', conn_type: 'XLR' as ConnectionType },
  { from_device: 'mic_wb1', from_port: 'MIC3', to_device: 'amu', to_port: 'CH15', conn_type: 'XLR' as ConnectionType },
  { from_device: 'mic_wb1', from_port: 'MIC4', to_device: 'amu', to_port: 'CH16', conn_type: 'XLR' as ConnectionType },
  { from_device: 'mic_wb2', from_port: 'MIC1', to_device: 'amu', to_port: 'CH17', conn_type: 'XLR' as ConnectionType },
  { from_device: 'mic_wb2', from_port: 'MIC2', to_device: 'amu', to_port: 'CH18', conn_type: 'XLR' as ConnectionType },
  { from_device: 'mic_obs', from_port: 'MIC1', to_device: 'amu', to_port: 'CH19', conn_type: 'XLR' as ConnectionType },
  { from_device: 'mic_obs', from_port: 'MIC2', to_device: 'amu', to_port: 'CH20', conn_type: 'XLR' as ConnectionType },
  { from_device: 'mic_obs', from_port: 'MIC3', to_device: 'amu', to_port: 'CH21', conn_type: 'XLR' as ConnectionType },
  { from_device: 'mic_cr', from_port: 'MIC1', to_device: 'amu', to_port: 'CH22', conn_type: 'XLR' as ConnectionType },
  { from_device: 'mic_cr', from_port: 'MIC2', to_device: 'amu', to_port: 'CH23', conn_type: 'XLR' as ConnectionType },
  { from_device: 'mic_pc', from_port: 'MIC1', to_device: 'amu', to_port: 'CH24', conn_type: 'XLR' as ConnectionType },
  { from_device: 'mic_pc', from_port: 'MIC2', to_device: 'amu', to_port: 'CH25', conn_type: 'XLR' as ConnectionType },
  { from_device: 'dibox1', from_port: 'CH1', to_device: 'amu', to_port: 'CH26', conn_type: 'ANALOG' as ConnectionType },
  { from_device: 'dibox1', from_port: 'CH2', to_device: 'amu', to_port: 'CH27', conn_type: 'ANALOG' as ConnectionType },
  { from_device: 'dibox2', from_port: 'CH1', to_device: 'amu', to_port: 'CH28', conn_type: 'ANALOG' as ConnectionType },
  { from_device: 'dibox2', from_port: 'CH2', to_device: 'amu', to_port: 'CH29', conn_type: 'ANALOG' as ConnectionType },
  { from_device: 'dibox3', from_port: 'CH1', to_device: 'amu', to_port: 'CH30', conn_type: 'ANALOG' as ConnectionType },
  { from_device: 'dibox4', from_port: 'CH1', to_device: 'amu', to_port: 'CH31', conn_type: 'ANALOG' as ConnectionType },
  { from_device: 'dibox_vmix', from_port: 'CH1', to_device: 'amu', to_port: 'CH32', conn_type: 'ANALOG' as ConnectionType },
  { from_device: 'mic_rack', from_port: 'DANTE OUT', to_device: 'dante_sw1', to_port: 'MIC RACK', conn_type: 'DANTE' as ConnectionType },
  { from_device: 'mic_rack', from_port: 'DANTE OUT', to_device: 'dante_sw2', to_port: 'MIC RACK', conn_type: 'DANTE' as ConnectionType },
  // AMU outputs
  { from_device: 'amu', from_port: 'BUS1', to_device: 'pa_main', to_port: 'AES', conn_type: 'AES' as ConnectionType },
  { from_device: 'amu', from_port: 'BUS2', to_device: 'pa_wb1', to_port: 'AES', conn_type: 'AES' as ConnectionType },
  { from_device: 'amu', from_port: 'BUS3', to_device: 'pa_wb2', to_port: 'AES', conn_type: 'AES' as ConnectionType },
  { from_device: 'amu', from_port: 'BUS4', to_device: 'pa_obs', to_port: 'AES', conn_type: 'AES' as ConnectionType },
  { from_device: 'amu', from_port: 'MON L', to_device: 'cr_speaker_l', to_port: 'AES', conn_type: 'AES' as ConnectionType },
  { from_device: 'amu', from_port: 'MON R', to_device: 'cr_speaker_r', to_port: 'AES', conn_type: 'AES' as ConnectionType },
  { from_device: 'amu', from_port: 'AUX1', to_device: 'intercom', to_port: 'CH1', conn_type: 'AES' as ConnectionType },
  { from_device: 'amu', from_port: 'AUX2', to_device: 'ada36', to_port: 'IP', conn_type: 'DANTE' as ConnectionType },
  { from_device: 'amu', from_port: 'AUX3', to_device: 'ada37', to_port: 'IP', conn_type: 'DANTE' as ConnectionType },
  { from_device: 'amu', from_port: 'AUX4', to_device: 'dante_sw1', to_port: 'AMU OUT', conn_type: 'DANTE' as ConnectionType },
  { from_device: 'amu', from_port: 'PGM L', to_device: 'mux_pgm', to_port: 'AUDIO', conn_type: 'AES' as ConnectionType },
  { from_device: 'amu', from_port: 'CLEAN L', to_device: 'mux_clean', to_port: 'AUDIO', conn_type: 'AES' as ConnectionType },
  { from_device: 'dante_sw1', from_port: 'AMU IN', to_device: 'dante_sw2', to_port: 'IP PRIMARY', conn_type: 'LAN' as ConnectionType },
];

// connType을 기반으로 자동 layerId 매핑
const VIDEO_TYPES = new Set(['SDI','12G-SDI','HDMI','DVI','FIBER','NDI','SMPTE-2110','IP']);
const AUDIO_TYPES = new Set(['AES','DANTE','MADI','AoIP','XLR','ANALOG']);
const CONTROL_TYPES = new Set(['USB','GPIO','LAN','RS-422']);

function layerFromConnType(ct?: ConnectionType, deviceType?: string): string {
  if (!ct) return deviceType === 'audio' ? 'layer_audio' : deviceType === 'combined' ? 'layer_video' : 'layer_video';
  if (ct === 'TIE') return 'layer_tie';
  if (CONTROL_TYPES.has(ct)) return 'layer_control';
  if (AUDIO_TYPES.has(ct)) return 'layer_audio';
  if (VIDEO_TYPES.has(ct)) return 'layer_video';
  return 'layer_video';
}

function toDevice(d: DeviceSeed): Device {
  const physPorts: Record<string, string> = {};
  const routing: Record<string, string> = {};
  const inputsMeta: Record<string, any> = {};
  const outputsMeta: Record<string, any> = {};
  if (d.inputsMeta) {
    for (const [k, v] of Object.entries(d.inputsMeta)) {
      inputsMeta[k] = { ...v, layerId: layerFromConnType(v.connType as ConnectionType, d.type) };
      if (v.label) physPorts[k] = v.label;
    }
  }
  // inputs 배열에 있지만 meta가 없는 경우도 기본 layerId 부여
  for (const p of d.inputs) {
    if (!inputsMeta[p]) inputsMeta[p] = { layerId: d.type === 'audio' ? 'layer_audio' : 'layer_video' };
  }
  if (d.outputsMeta) {
    for (const [k, v] of Object.entries(d.outputsMeta)) {
      outputsMeta[k] = { ...v, layerId: layerFromConnType(v.connType as ConnectionType, d.type) };
      if (v.label) routing[k] = v.label;
    }
  }
  for (const p of d.outputs) {
    if (!outputsMeta[p]) outputsMeta[p] = { layerId: d.type === 'audio' ? 'layer_audio' : 'layer_video' };
  }
  return { ...d, inputsMeta, outputsMeta, physPorts, routing };
}

export const INITIAL_DEVICES: Device[] = [...videoDevices, ...audioDevices].map(toDevice);

export const TYPE_COLORS = {
  video:    { main: '#3B82F6', glow: '#60A5FA', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.5)' },
  audio:    { main: '#EF4444', glow: '#F87171', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.5)' },
  combined: { main: '#A855F7', glow: '#C084FC', bg: 'rgba(168,85,247,0.08)',  border: 'rgba(168,85,247,0.5)' },
};

// 연결방식별 선 스타일 (dash pattern)
export const CONN_TYPE_STYLES: Record<string, { dash?: string; label: string }> = {
  'SDI':        { label: 'SDI' },
  '12G-SDI':    { label: '12G-SDI' },
  'HDMI':       { label: 'HDMI' },
  'DVI':        { label: 'DVI' },
  'FIBER':      { dash: '12 4', label: 'FIBER' },
  'NDI':        { dash: '8 4 2 4', label: 'NDI' },
  'SMPTE-2110': { dash: '10 5', label: '2110' },
  'IP':         { dash: '6 3', label: 'IP' },
  'AES':        { label: 'AES' },
  'DANTE':      { dash: '4 4', label: 'DANTE' },
  'MADI':       { dash: '6 3 2 3', label: 'MADI' },
  'AoIP':       { dash: '5 5', label: 'AoIP' },
  'XLR':        { label: 'XLR' },
  'ANALOG':     { label: 'ANALOG' },
  'USB':        { dash: '2 3', label: 'USB' },
  'GPIO':       { dash: '3 3', label: 'GPIO' },
  'LAN':        { dash: '6 3', label: 'LAN' },
  'RS-422':     { dash: '3 2', label: 'RS-422' },
  'TIE':        { dash: '1 4', label: 'TIE' },
};
