import type { Device } from './supabase';

// ============================================================
// 도면 기반 장비 레이아웃
// Column: 소스(40) → CCU/RX(240) → 분배/처리(420) → 라우터(620) → 스위처(880) → 변환(1080) → 출력(1280)
// Video 상단, Audio 중하단
// ============================================================

export const INITIAL_DEVICES: Device[] = [
  // ============== VIDEO SOURCES ==============
  { id: 'cam1', name: 'CAM 1', type: 'video', x: 40, y: 60, inputs: [], outputs: ['SDI'], physPorts: { 'SDI': 'CAM-1 12G OP' }, routing: { 'SDI': 'CCU-1 IP' } },
  { id: 'cam2', name: 'CAM 2', type: 'video', x: 40, y: 150, inputs: [], outputs: ['SDI'], physPorts: { 'SDI': 'CAM-2 12G OP' }, routing: { 'SDI': 'CCU-2 IP' } },
  { id: 'cam3', name: 'CAM 3', type: 'video', x: 40, y: 240, inputs: [], outputs: ['SDI'], physPorts: { 'SDI': 'CAM-3 12G OP' }, routing: { 'SDI': 'CCU-3 IP' } },
  { id: 'cam4', name: 'CAM 4', type: 'video', x: 40, y: 330, inputs: [], outputs: ['SDI'], physPorts: { 'SDI': 'CAM-4 12G OP' }, routing: { 'SDI': 'CCU-4 IP' } },
  { id: 'ptz1', name: 'PTZ CAM-1', type: 'video', x: 40, y: 440, inputs: [], outputs: ['SDI'], physPorts: { 'SDI': 'PTZ-1 OP' }, routing: { 'SDI': 'UHD VDA-1B IP' } },
  { id: 'ptz2', name: 'PTZ CAM-2', type: 'video', x: 40, y: 520, inputs: [], outputs: ['SDI'], physPorts: { 'SDI': 'PTZ-2 OP' }, routing: { 'SDI': 'UHD VDA-1B IP' } },
  { id: 'ptz3', name: 'PTZ CAM-3', type: 'video', x: 40, y: 600, inputs: [], outputs: ['SDI'], physPorts: { 'SDI': 'PTZ-3 OP' }, routing: { 'SDI': 'UHD VDA-2B IP' } },
  { id: 'fiber_rx1', name: 'FIBER RX-1', type: 'video', x: 40, y: 700, inputs: ['FIBER'], outputs: ['SDI'], physPorts: { 'FIBER': '중계석#1 CAM-1' }, routing: {} },
  { id: 'fiber_rx2', name: 'FIBER RX-2', type: 'video', x: 40, y: 790, inputs: ['FIBER'], outputs: ['SDI'], physPorts: { 'FIBER': '중계석#1 CAM-2' }, routing: {} },

  // ============== AUDIO SOURCES ==============
  { id: 'wl_mic1', name: 'W/L MIC 1', type: 'audio', x: 40, y: 900, inputs: [], outputs: ['ANT'], physPorts: { 'ANT': 'W/L-1 ANT' }, routing: {} },
  { id: 'wl_mic2', name: 'W/L MIC 2', type: 'audio', x: 40, y: 960, inputs: [], outputs: ['ANT'], physPorts: { 'ANT': 'W/L-2 ANT' }, routing: {} },
  { id: 'mic_wb1', name: '주경기장 MIC 1-4', type: 'audio', x: 40, y: 1030, inputs: [], outputs: ['AES1', 'AES2'], physPorts: { 'AES1': 'WALL BOX-1 OP' }, routing: { 'AES1': 'AMU IP-13' } },
  { id: 'mic_wb2', name: '주경기장 MIC 1-2', type: 'audio', x: 40, y: 1120, inputs: [], outputs: ['AES'], physPorts: { 'AES': 'WALL BOX-2 OP' }, routing: {} },
  { id: 'mic_cr', name: '크로마실 MIC 1-2', type: 'audio', x: 40, y: 1200, inputs: [], outputs: ['AES'], physPorts: { 'AES': '크로마실 W/BOX OP' }, routing: {} },

  // ============== CCU (Col 2) ==============
  { id: 'ccu1', name: 'CCU-1', type: 'video', x: 240, y: 60, inputs: ['IP'], outputs: ['12G OP-1', '12G OP-2', '12G OP-3'], physPorts: { 'IP': 'CAM-1', '12G OP-3': 'R/S IP-1' }, routing: {} },
  { id: 'ccu2', name: 'CCU-2', type: 'video', x: 240, y: 150, inputs: ['IP'], outputs: ['12G OP-1', '12G OP-2', '12G OP-3'], physPorts: { 'IP': 'CAM-2', '12G OP-3': 'R/S IP-2' }, routing: {} },
  { id: 'ccu3', name: 'CCU-3', type: 'video', x: 240, y: 240, inputs: ['IP'], outputs: ['12G OP-1', '12G OP-2', '12G OP-3'], physPorts: { 'IP': 'CAM-3', '12G OP-3': 'R/S IP-3' }, routing: {} },
  { id: 'ccu4', name: 'CCU-4', type: 'video', x: 240, y: 330, inputs: ['IP'], outputs: ['12G OP-1', '12G OP-2', '12G OP-3'], physPorts: { 'IP': 'CAM-4', '12G OP-3': 'R/S IP-4' }, routing: {} },
  { id: 'wl_rx1', name: 'W/L Receiver-1', type: 'audio', x: 240, y: 900, inputs: ['ANT-A', 'ANT-B'], outputs: ['AES-A', 'AES-B'], physPorts: { 'AES-A': 'AMU IP-17' }, routing: {} },
  { id: 'wl_rx2', name: 'W/L Receiver-2', type: 'audio', x: 240, y: 990, inputs: ['ANT-A', 'ANT-B'], outputs: ['AES-A', 'AES-B'], physPorts: {}, routing: {} },
  { id: 'dibox1', name: 'DI BOX-1', type: 'audio', x: 240, y: 1080, inputs: ['USB'], outputs: ['CH1', 'CH2'], physPorts: { 'USB': '음저버-1 USB' }, routing: {} },
  { id: 'dibox2', name: 'DI BOX-2', type: 'audio', x: 240, y: 1160, inputs: ['USB'], outputs: ['CH1', 'CH2'], physPorts: { 'USB': '음저버-2 USB' }, routing: {} },
  { id: 'dibox3', name: 'DI BOX-3', type: 'audio', x: 240, y: 1240, inputs: ['USB'], outputs: ['CH1', 'CH2'], physPorts: { 'USB': '음저버-3 USB' }, routing: {} },
  { id: 'dibox_vmix', name: 'DI BOX V-MIX', type: 'audio', x: 240, y: 1320, inputs: ['USB'], outputs: ['CH1', 'CH2'], physPorts: { 'USB': 'V-MIX USB' }, routing: {} },

  // ============== 분배 / 소스 (Col 3) ==============
  { id: 'cg1', name: 'CG-1', type: 'video', x: 420, y: 60, inputs: ['KEYBOARD'], outputs: ['FILL', 'KEY'], physPorts: {}, routing: { 'FILL': 'R/S IP-11', 'KEY': 'R/S IP-12' } },
  { id: 'replay', name: 'Replay (Vieco)', type: 'video', x: 420, y: 170, inputs: [], outputs: ['CH A', 'CH B'], physPorts: {}, routing: { 'CH A': 'R/S IP-15' } },
  { id: 'ssd_a', name: 'SSD PLAY/REC A', type: 'video', x: 420, y: 270, inputs: [], outputs: ['OP'], physPorts: {}, routing: { 'OP': 'R/S IP-17' } },
  { id: 'ssd_b', name: 'SSD PLAY/REC B', type: 'video', x: 420, y: 350, inputs: [], outputs: ['OP'], physPorts: {}, routing: { 'OP': 'R/S IP-18' } },
  { id: 'vmix', name: 'VMIX', type: 'video', x: 420, y: 430, inputs: ['IN'], outputs: ['OP'], physPorts: {}, routing: { 'OP': 'R/S IP-14' } },
  { id: 'vda1_1a', name: 'UHD VDA 1-1A', type: 'video', x: 420, y: 520, inputs: ['IP'], outputs: ['OP-1', 'OP-2', 'OP-3', 'OP-4'], physPorts: { 'IP': 'CCU-1 12G OP-1' }, routing: {} },
  { id: 'vda2_1a', name: 'UHD VDA 2-1A', type: 'video', x: 420, y: 640, inputs: ['IP'], outputs: ['OP-1', 'OP-2', 'OP-3', 'OP-4'], physPorts: { 'IP': 'CCU-1 12G OP-2' }, routing: {} },
  { id: 'demux1', name: 'DEMUX-1', type: 'combined', x: 420, y: 770, inputs: ['UHD SDI'], outputs: ['AES1-4', 'VIDEO OUT'], physPorts: { 'UHD SDI': 'From R/S OP-13' }, routing: {} },
  { id: 'demux2', name: 'DEMUX-2', type: 'combined', x: 420, y: 870, inputs: ['UHD SDI'], outputs: ['AES1-4', 'VIDEO OUT'], physPorts: { 'UHD SDI': 'From R/S OP-14' }, routing: {} },

  // ============== 32x32 ROUTER (Col 4) ==============
  { id: 'router', name: '32x32 Routing Switcher', type: 'video', x: 620, y: 60,
    inputs: ['IP1','IP2','IP3','IP4','IP5','IP6','IP7','IP8','IP9','IP10','IP11','IP12','IP13','IP14','IP15','IP16','IP17','IP18'],
    outputs: ['OP1','OP2','OP3','OP4','OP5','OP6','OP7','OP8','OP9','OP10','OP11','OP12','OP13','OP14','OP15','OP16'],
    physPorts: {}, routing: {} },

  // ============== AMU (Digital Audio Mixer) ==============
  { id: 'amu', name: 'Digital Audio Mixer (AMU)', type: 'audio', x: 620, y: 850,
    inputs: ['CH1','CH2','CH3','CH4','CH5','CH6','CH7','CH8','CH9','CH10','CH11','CH12','CH13','CH14','CH15','CH16'],
    outputs: ['BUS1','BUS2','BUS3','BUS4','AUX1','AUX2','AUX3','AUX4','PGM','CLEAN','MON'],
    physPorts: {}, routing: {} },

  // ============== SWITCHERS (Col 5) ==============
  { id: 'mvs', name: 'Main Video Switcher (XVS-G1)', type: 'video', x: 880, y: 60,
    inputs: ['IP1','IP2','IP3','IP4','IP5','IP6','IP7','IP8','IP9','IP10','IP11','IP12'],
    outputs: ['PGM 1','PGM 2','CLEAN 1','CLEAN 2','PVW 1','AUX 1','AUX 2','AUX 3','AUX 4'],
    physPorts: {}, routing: {} },
  { id: 'svs', name: 'Sub Video Switcher (ATEM 4M/E)', type: 'video', x: 880, y: 490,
    inputs: ['IP1','IP2','IP3','IP4','IP5','IP6','IP7','IP8'],
    outputs: ['PGM','CLEAN','PVW','AUX1','AUX2','AUX3'],
    physPorts: {}, routing: {} },
  { id: 'mv_main', name: 'Main Multi-View', type: 'video', x: 880, y: 820, inputs: ['IP1','IP2','IP3','IP4','IP5','IP6','IP7','IP8'], outputs: ['MV1','MV2','MV3','MV4'], physPorts: {}, routing: {} },
  { id: 'ada36', name: 'Analog ADA 3-6', type: 'audio', x: 880, y: 1100, inputs: ['IP'], outputs: ['OP-1','OP-2','OP-3','OP-4'], physPorts: {}, routing: {} },
  { id: 'ada37', name: 'Analog ADA 3-7', type: 'audio', x: 880, y: 1210, inputs: ['IP'], outputs: ['OP-1','OP-2','OP-3','OP-4'], physPorts: {}, routing: {} },
  { id: 'dante1', name: 'Dante Network SW#1', type: 'audio', x: 880, y: 1330, inputs: ['IP-1','IP-2','IP-3','IP-4'], outputs: ['OP-1','OP-2','OP-3','OP-4'], physPorts: {}, routing: {} },
  { id: 'dante2', name: 'Dante SW#2 (BACKUP)', type: 'audio', x: 880, y: 1470, inputs: ['IP-1','IP-2','IP-3','IP-4'], outputs: ['OP-1','OP-2','OP-3','OP-4'], physPorts: {}, routing: {} },

  // ============== EMBEDDERS / MCU (Col 6) ==============
  { id: 'emb_pgm', name: 'Embedder (PGM)', type: 'combined', x: 1080, y: 60, inputs: ['VIDEO', 'AUDIO'], outputs: ['SDI+EMB'], physPorts: {}, routing: {} },
  { id: 'emb_clean', name: 'Embedder (CLEAN)', type: 'combined', x: 1080, y: 170, inputs: ['VIDEO', 'AUDIO'], outputs: ['SDI+EMB'], physPorts: {}, routing: {} },
  { id: 'mcu1', name: 'MCU-1', type: 'video', x: 1080, y: 280, inputs: ['SDI-1','SDI-2'], outputs: ['HDMI', 'LAN'], physPorts: {}, routing: {} },
  { id: 'mcu2', name: 'MCU-2', type: 'video', x: 1080, y: 390, inputs: ['DVI-1','DVI-2'], outputs: ['HDMI', 'LAN'], physPorts: {}, routing: {} },
  { id: 'mcu3', name: 'MCU-3', type: 'video', x: 1080, y: 500, inputs: ['DVI-1','DVI-2'], outputs: ['HDMI', 'LAN'], physPorts: {}, routing: {} },
  { id: 'mv1', name: 'Multi View Mon-1', type: 'video', x: 1080, y: 620, inputs: ['MV'], outputs: [], physPorts: {}, routing: {} },
  { id: 'mv2', name: 'Multi View Mon-2', type: 'video', x: 1080, y: 700, inputs: ['MV'], outputs: [], physPorts: {}, routing: {} },
  { id: 'mv3', name: 'Multi View Mon-3', type: 'video', x: 1080, y: 780, inputs: ['MV'], outputs: [], physPorts: {}, routing: {} },

  // ============== OUTPUTS (Col 7) ==============
  { id: 'led_stage', name: '주경기장 무대 LED', type: 'video', x: 1280, y: 60, inputs: ['HDMI'], outputs: [], physPorts: { 'HDMI': 'MCU-1 HDMI' }, routing: {} },
  { id: 'led_entry', name: '주경기장 입구 LED', type: 'video', x: 1280, y: 160, inputs: ['HDMI'], outputs: [], physPorts: { 'HDMI': 'MCU-2 HDMI' }, routing: {} },
  { id: 'led_bottom', name: '주경기장 하단 LED', type: 'video', x: 1280, y: 260, inputs: ['HDMI'], outputs: [], physPorts: { 'HDMI': 'MCU-3 HDMI' }, routing: {} },
  { id: 'main_pgm', name: 'MAIN PGM', type: 'combined', x: 1280, y: 360, inputs: ['SDI'], outputs: [], physPorts: { 'SDI': 'VDA1-7 IP' }, routing: { 'SDI': 'R/S OP-27' } },
  { id: 'main_clean', name: 'MAIN CLEAN', type: 'combined', x: 1280, y: 440, inputs: ['SDI'], outputs: [], physPorts: {}, routing: { 'SDI': 'R/S OP-28' } },
  { id: 'main_pvw', name: 'MAIN PVW', type: 'video', x: 1280, y: 520, inputs: ['SDI'], outputs: [], physPorts: {}, routing: {} },
  { id: 'ingest_svr', name: 'INGEST SVR', type: 'combined', x: 1280, y: 600, inputs: ['SDI-1','SDI-2','SDI-3'], outputs: [], physPorts: {}, routing: {} },
  { id: 'td_desk', name: 'TD DESK (18" MON)', type: 'video', x: 1280, y: 710, inputs: ['MON'], outputs: [], physPorts: {}, routing: {} },
  { id: 'video_desk', name: 'VIDEO DESK', type: 'video', x: 1280, y: 790, inputs: ['MON'], outputs: [], physPorts: {}, routing: {} },
  { id: 'audio_desk', name: 'AUDIO DESK (12G)', type: 'video', x: 1280, y: 870, inputs: ['MON'], outputs: [], physPorts: {}, routing: {} },
  { id: 'pa_mixer', name: '기존 PA MIXER', type: 'audio', x: 1280, y: 960, inputs: ['AES'], outputs: [], physPorts: { 'AES': 'AMU PGM OP' }, routing: {} },
  { id: 'cr_speaker', name: 'C/R Speaker', type: 'audio', x: 1280, y: 1040, inputs: ['AES'], outputs: [], physPorts: {}, routing: {} },
  { id: 'wb_pa1', name: '주경기장 W/B-1 PA', type: 'audio', x: 1280, y: 1120, inputs: ['AES'], outputs: [], physPorts: {}, routing: {} },
  { id: 'wb_pa2', name: '주경기장 W/B-2 PA', type: 'audio', x: 1280, y: 1200, inputs: ['AES'], outputs: [], physPorts: {}, routing: {} },
  { id: 'intercom', name: 'INTERCOM', type: 'audio', x: 1280, y: 1280, inputs: ['AES'], outputs: [], physPorts: {}, routing: {} },
  { id: 'tally', name: 'Tally Switch', type: 'combined', x: 1280, y: 1360, inputs: ['GPO'], outputs: [], physPorts: { 'GPO': 'ON-AIR LAMP' }, routing: {} },
  { id: 'player_mon1', name: 'A팀 WALL BOX', type: 'video', x: 1280, y: 1440, inputs: ['SDI'], outputs: [], physPorts: {}, routing: { 'SDI': 'R/S OP-22' } },
  { id: 'player_mon2', name: 'B팀 WALL BOX', type: 'video', x: 1280, y: 1520, inputs: ['SDI'], outputs: [], physPorts: {}, routing: { 'SDI': 'R/S OP-23' } },
];

export const INITIAL_CONNECTIONS = [
  // CAM → CCU
  { from_device: 'cam1', from_port: 'SDI', to_device: 'ccu1', to_port: 'IP' },
  { from_device: 'cam2', from_port: 'SDI', to_device: 'ccu2', to_port: 'IP' },
  { from_device: 'cam3', from_port: 'SDI', to_device: 'ccu3', to_port: 'IP' },
  { from_device: 'cam4', from_port: 'SDI', to_device: 'ccu4', to_port: 'IP' },

  // CCU → VDA / Router
  { from_device: 'ccu1', from_port: '12G OP-1', to_device: 'vda1_1a', to_port: 'IP' },
  { from_device: 'ccu1', from_port: '12G OP-2', to_device: 'vda2_1a', to_port: 'IP' },
  { from_device: 'ccu1', from_port: '12G OP-3', to_device: 'router', to_port: 'IP1' },
  { from_device: 'ccu2', from_port: '12G OP-3', to_device: 'router', to_port: 'IP2' },
  { from_device: 'ccu3', from_port: '12G OP-3', to_device: 'router', to_port: 'IP3' },
  { from_device: 'ccu4', from_port: '12G OP-3', to_device: 'router', to_port: 'IP4' },

  // PTZ → Router
  { from_device: 'ptz1', from_port: 'SDI', to_device: 'router', to_port: 'IP5' },
  { from_device: 'ptz2', from_port: 'SDI', to_device: 'router', to_port: 'IP6' },
  { from_device: 'ptz3', from_port: 'SDI', to_device: 'router', to_port: 'IP7' },
  { from_device: 'fiber_rx1', from_port: 'SDI', to_device: 'router', to_port: 'IP8' },
  { from_device: 'fiber_rx2', from_port: 'SDI', to_device: 'router', to_port: 'IP9' },

  // Sources → Router
  { from_device: 'cg1', from_port: 'FILL', to_device: 'router', to_port: 'IP11' },
  { from_device: 'cg1', from_port: 'KEY', to_device: 'router', to_port: 'IP12' },
  { from_device: 'replay', from_port: 'CH A', to_device: 'router', to_port: 'IP15' },
  { from_device: 'replay', from_port: 'CH B', to_device: 'router', to_port: 'IP16' },
  { from_device: 'ssd_a', from_port: 'OP', to_device: 'router', to_port: 'IP17' },
  { from_device: 'ssd_b', from_port: 'OP', to_device: 'router', to_port: 'IP18' },
  { from_device: 'vmix', from_port: 'OP', to_device: 'router', to_port: 'IP14' },

  // Router → Main Switcher
  { from_device: 'router', from_port: 'OP1', to_device: 'mvs', to_port: 'IP1' },
  { from_device: 'router', from_port: 'OP2', to_device: 'mvs', to_port: 'IP2' },
  { from_device: 'router', from_port: 'OP3', to_device: 'mvs', to_port: 'IP3' },
  { from_device: 'router', from_port: 'OP4', to_device: 'mvs', to_port: 'IP4' },
  { from_device: 'router', from_port: 'OP5', to_device: 'svs', to_port: 'IP1' },
  { from_device: 'router', from_port: 'OP6', to_device: 'svs', to_port: 'IP2' },
  { from_device: 'router', from_port: 'OP13', to_device: 'demux1', to_port: 'UHD SDI' },
  { from_device: 'router', from_port: 'OP14', to_device: 'demux2', to_port: 'UHD SDI' },
  { from_device: 'router', from_port: 'OP7', to_device: 'mcu1', to_port: 'SDI-1' },
  { from_device: 'router', from_port: 'OP8', to_device: 'mcu2', to_port: 'DVI-1' },
  { from_device: 'router', from_port: 'OP9', to_device: 'mcu3', to_port: 'DVI-1' },
  { from_device: 'router', from_port: 'OP10', to_device: 'player_mon1', to_port: 'SDI' },
  { from_device: 'router', from_port: 'OP11', to_device: 'player_mon2', to_port: 'SDI' },
  { from_device: 'router', from_port: 'OP15', to_device: 'mv_main', to_port: 'IP1' },
  { from_device: 'router', from_port: 'OP16', to_device: 'mv_main', to_port: 'IP2' },

  // MCU → LED
  { from_device: 'mcu1', from_port: 'HDMI', to_device: 'led_stage', to_port: 'HDMI' },
  { from_device: 'mcu2', from_port: 'HDMI', to_device: 'led_entry', to_port: 'HDMI' },
  { from_device: 'mcu3', from_port: 'HDMI', to_device: 'led_bottom', to_port: 'HDMI' },

  // DEMUX → AMU (audio extraction)
  { from_device: 'demux1', from_port: 'AES1-4', to_device: 'amu', to_port: 'CH5' },
  { from_device: 'demux2', from_port: 'AES1-4', to_device: 'amu', to_port: 'CH9' },

  // AUDIO
  { from_device: 'wl_mic1', from_port: 'ANT', to_device: 'wl_rx1', to_port: 'ANT-A' },
  { from_device: 'wl_mic2', from_port: 'ANT', to_device: 'wl_rx2', to_port: 'ANT-A' },
  { from_device: 'wl_rx1', from_port: 'AES-A', to_device: 'amu', to_port: 'CH1' },
  { from_device: 'wl_rx2', from_port: 'AES-A', to_device: 'amu', to_port: 'CH2' },
  { from_device: 'mic_wb1', from_port: 'AES1', to_device: 'amu', to_port: 'CH13' },
  { from_device: 'mic_wb1', from_port: 'AES2', to_device: 'amu', to_port: 'CH14' },
  { from_device: 'mic_wb2', from_port: 'AES', to_device: 'amu', to_port: 'CH15' },
  { from_device: 'mic_cr', from_port: 'AES', to_device: 'amu', to_port: 'CH16' },
  { from_device: 'dibox1', from_port: 'CH1', to_device: 'amu', to_port: 'CH3' },
  { from_device: 'dibox2', from_port: 'CH1', to_device: 'amu', to_port: 'CH4' },
  { from_device: 'dibox_vmix', from_port: 'CH1', to_device: 'amu', to_port: 'CH6' },

  // AMU → Outputs
  { from_device: 'amu', from_port: 'PGM', to_device: 'emb_pgm', to_port: 'AUDIO' },
  { from_device: 'amu', from_port: 'CLEAN', to_device: 'emb_clean', to_port: 'AUDIO' },
  { from_device: 'amu', from_port: 'BUS1', to_device: 'pa_mixer', to_port: 'AES' },
  { from_device: 'amu', from_port: 'BUS2', to_device: 'wb_pa1', to_port: 'AES' },
  { from_device: 'amu', from_port: 'BUS3', to_device: 'wb_pa2', to_port: 'AES' },
  { from_device: 'amu', from_port: 'MON', to_device: 'cr_speaker', to_port: 'AES' },
  { from_device: 'amu', from_port: 'AUX1', to_device: 'intercom', to_port: 'AES' },
  { from_device: 'amu', from_port: 'AUX2', to_device: 'ada36', to_port: 'IP' },
  { from_device: 'amu', from_port: 'AUX3', to_device: 'ada37', to_port: 'IP' },
  { from_device: 'amu', from_port: 'AUX4', to_device: 'dante1', to_port: 'IP-1' },

  // Main Switcher → Outputs
  { from_device: 'mvs', from_port: 'PGM 1', to_device: 'emb_pgm', to_port: 'VIDEO' },
  { from_device: 'mvs', from_port: 'CLEAN 1', to_device: 'emb_clean', to_port: 'VIDEO' },
  { from_device: 'mvs', from_port: 'PVW 1', to_device: 'main_pvw', to_port: 'SDI' },
  { from_device: 'mvs', from_port: 'AUX 1', to_device: 'td_desk', to_port: 'MON' },
  { from_device: 'mvs', from_port: 'AUX 2', to_device: 'video_desk', to_port: 'MON' },
  { from_device: 'mvs', from_port: 'AUX 3', to_device: 'audio_desk', to_port: 'MON' },

  // Embedders → Final
  { from_device: 'emb_pgm', from_port: 'SDI+EMB', to_device: 'main_pgm', to_port: 'SDI' },
  { from_device: 'emb_pgm', from_port: 'SDI+EMB', to_device: 'ingest_svr', to_port: 'SDI-1' },
  { from_device: 'emb_clean', from_port: 'SDI+EMB', to_device: 'main_clean', to_port: 'SDI' },
  { from_device: 'emb_clean', from_port: 'SDI+EMB', to_device: 'ingest_svr', to_port: 'SDI-2' },

  // Multi-view
  { from_device: 'mv_main', from_port: 'MV1', to_device: 'mv1', to_port: 'MV' },
  { from_device: 'mv_main', from_port: 'MV2', to_device: 'mv2', to_port: 'MV' },
  { from_device: 'mv_main', from_port: 'MV3', to_device: 'mv3', to_port: 'MV' },
];

export const TYPE_COLORS = {
  video:    { main: '#3B82F6', glow: '#60A5FA', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.5)' },
  audio:    { main: '#EF4444', glow: '#F87171', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.5)' },
  combined: { main: '#A855F7', glow: '#C084FC', bg: 'rgba(168,85,247,0.08)',  border: 'rgba(168,85,247,0.5)' },
};
