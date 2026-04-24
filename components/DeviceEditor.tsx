'use client';
import { useState, useEffect } from 'react';
import { Device, CONNECTION_TYPES, ConnectionType, PortInfo, Layer, DEVICE_ROLES, DEVICE_ROLE_LABELS, DeviceRole, MULTIVIEW_LAYOUTS, MultiviewLayoutId, supabase } from '../lib/supabase';

type Props = {
  device: Device;
  layers: Layer[];
  selectionCount?: number;  // 현재 다중선택된 장비 수
  onSave: (updates: Partial<Device>) => void;
  onSaveToSelection?: (updates: Partial<Device>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
};

type PortRow = { name: string; label: string; connType: ConnectionType | ''; layerId: string };

const TYPE_ACCENT = {
  video:    { grad: 'from-sky-500/20 to-sky-600/5',     ring: 'ring-sky-500/40',    dot: '#3B82F6' },
  audio:    { grad: 'from-rose-500/20 to-rose-600/5',   ring: 'ring-rose-500/40',   dot: '#EF4444' },
  combined: { grad: 'from-purple-500/20 to-purple-600/5', ring: 'ring-purple-500/40', dot: '#A855F7' },
};

export default function DeviceEditor({ device, layers, selectionCount, onSave, onSaveToSelection, onDelete, onDuplicate, onClose }: Props) {
  const [name, setName] = useState(device.name);
  const [model, setModel] = useState(device.model ?? '');
  const [location, setLocation] = useState(device.location ?? '');
  const [roomNumber, setRoomNumber] = useState(device.roomNumber ?? '');
  const [imageUrl, setImageUrl] = useState(device.imageUrl ?? '');
  const [imageStoragePath, setImageStoragePath] = useState(device.imageStoragePath ?? '');
  const [audioUrl, setAudioUrl] = useState(device.audioUrl ?? '');
  const [audioStoragePath, setAudioStoragePath] = useState(device.audioStoragePath ?? '');
  const [selectedInput, setSelectedInput] = useState(device.selectedInput ?? '');
  // 멀티뷰
  const [multiviewLayout, setMultiviewLayout] = useState<MultiviewLayoutId>((device.multiviewLayout as MultiviewLayoutId) ?? 'pgm+pvw+6');
  const [multiviewPgmInput, setMultiviewPgmInput] = useState(device.multiviewPgmInput ?? '');
  const [multiviewPvwInput, setMultiviewPvwInput] = useState(device.multiviewPvwInput ?? '');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [type, setType] = useState<Device['type']>(device.type);
  const [role, setRole] = useState<DeviceRole>(device.role ?? 'standard');
  const [pgmPort, setPgmPort] = useState<string>(device.pgmPort ?? '');
  const [normals, setNormals] = useState<Record<string, string>>(device.normals ?? {});
  const [width, setWidth] = useState(device.width ?? 200);
  const [inputs, setInputs] = useState<PortRow[]>([]);
  const [outputs, setOutputs] = useState<PortRow[]>([]);
  const [bulkMode, setBulkMode] = useState<'list' | 'text'>('list');
  const [bulkInputs, setBulkInputs] = useState('');
  const [bulkOutputs, setBulkOutputs] = useState('');

  const defaultLayerId = layers[0]?.id ?? 'layer_video';
  const accent = TYPE_ACCENT[type];

  useEffect(() => {
    setName(device.name);
    setModel(device.model ?? '');
    setLocation(device.location ?? '');
    setRoomNumber(device.roomNumber ?? '');
    setImageUrl(device.imageUrl ?? '');
    setImageStoragePath(device.imageStoragePath ?? '');
    setAudioUrl(device.audioUrl ?? '');
    setAudioStoragePath(device.audioStoragePath ?? '');
    setSelectedInput(device.selectedInput ?? '');
    setMultiviewLayout((device.multiviewLayout as MultiviewLayoutId) ?? 'pgm+pvw+6');
    setMultiviewPgmInput(device.multiviewPgmInput ?? '');
    setMultiviewPvwInput(device.multiviewPvwInput ?? '');
    setType(device.type);
    setRole(device.role ?? 'standard');
    setPgmPort(device.pgmPort ?? '');
    setNormals(device.normals ?? {});
    setWidth(device.width ?? 200);
    const toRows = (arr: string[], meta?: Record<string, PortInfo>): PortRow[] =>
      arr.map(p => ({
        name: p,
        label: meta?.[p]?.label ?? device.physPorts?.[p] ?? '',
        connType: (meta?.[p]?.connType as ConnectionType) ?? '',
        layerId: meta?.[p]?.layerId ?? defaultLayerId,
      }));
    setInputs(toRows(device.inputs, device.inputsMeta));
    setOutputs(toRows(device.outputs, device.outputsMeta));
    setBulkInputs(device.inputs.join(', '));
    setBulkOutputs(device.outputs.join(', '));
  }, [device, defaultLayerId]);

  const addPort = (dir: 'in' | 'out') => {
    const arr = dir === 'in' ? inputs : outputs;
    const nextIdx = arr.length + 1;
    const row: PortRow = { name: `${dir === 'in' ? 'IN' : 'OUT'}-${nextIdx}`, label: '', connType: '', layerId: defaultLayerId };
    if (dir === 'in') setInputs([...inputs, row]); else setOutputs([...outputs, row]);
  };
  const removePort = (dir: 'in' | 'out', i: number) => {
    if (dir === 'in') setInputs(inputs.filter((_, idx) => idx !== i));
    else setOutputs(outputs.filter((_, idx) => idx !== i));
  };
  const updatePort = (dir: 'in' | 'out', i: number, field: keyof PortRow, value: string) => {
    const update = (arr: PortRow[]) => arr.map((r, idx) => idx === i ? { ...r, [field]: value } : r);
    if (dir === 'in') setInputs(update(inputs)); else setOutputs(update(outputs));
  };
  const applyLayerToAll = (dir: 'in' | 'out', layerId: string) => {
    if (dir === 'in') setInputs(inputs.map(r => ({ ...r, layerId })));
    else setOutputs(outputs.map(r => ({ ...r, layerId })));
  };

  // 지정 개수로 포트 리스트 맞추기 (증가 시 자동 생성, 감소 시 뒤에서 제거)
  const setPortCount = (dir: 'in' | 'out', count: number) => {
    const n = Math.max(0, Math.min(128, Math.floor(count)));
    const rows = dir === 'in' ? inputs : outputs;
    const prefix = dir === 'in' ? 'IN' : 'OUT';
    if (n === rows.length) return;
    if (n > rows.length) {
      // 빈 슬롯 채우기 - 연번 번호 01, 02 ... 식으로
      const next = [...rows];
      const needsPad = n >= 10;
      const pad = (i: number) => needsPad ? String(i).padStart(2, '0') : String(i);
      for (let i = rows.length + 1; i <= n; i++) {
        let name = `${prefix}-${pad(i)}`;
        // 충돌 회피
        while (next.some(r => r.name === name)) name = `${name}_`;
        next.push({ name, label: '', connType: '', layerId: defaultLayerId });
      }
      if (dir === 'in') setInputs(next);
      else setOutputs(next);
    } else {
      // 뒤에서 제거
      const next = rows.slice(0, n);
      if (dir === 'in') setInputs(next);
      else setOutputs(next);
    }
  };

  const buildUpdates = (): Partial<Device> => {
    let finalInputs: PortRow[], finalOutputs: PortRow[];
    if (bulkMode === 'text') {
      finalInputs = bulkInputs.split(',').map(s => s.trim()).filter(Boolean)
        .map(n => { const ex = inputs.find(x => x.name === n); return ex ?? { name: n, label: '', connType: '', layerId: defaultLayerId }; });
      finalOutputs = bulkOutputs.split(',').map(s => s.trim()).filter(Boolean)
        .map(n => { const ex = outputs.find(x => x.name === n); return ex ?? { name: n, label: '', connType: '', layerId: defaultLayerId }; });
    } else {
      finalInputs = inputs.filter(r => r.name.trim());
      finalOutputs = outputs.filter(r => r.name.trim());
    }
    const inputsMeta: Record<string, PortInfo> = {};
    const outputsMeta: Record<string, PortInfo> = {};
    const physPorts: Record<string, string> = {};
    finalInputs.forEach(r => {
      inputsMeta[r.name] = { name: r.name, label: r.label || undefined, connType: r.connType || undefined, layerId: r.layerId };
      if (r.label) physPorts[r.name] = r.label;
    });
    finalOutputs.forEach(r => {
      outputsMeta[r.name] = { name: r.name, label: r.label || undefined, connType: r.connType || undefined, layerId: r.layerId };
      if (r.label) physPorts[r.name] = r.label;
    });
    return {
      name: name.trim() || device.name,
      model: model.trim() || null,
      location: role === 'wallbox' ? (location.trim() || null) : null,
      roomNumber: role === 'wallbox' ? (roomNumber.trim() || null) : null,
      imageUrl: role === 'source' ? (imageUrl.trim() || null) : null,
      imageStoragePath: role === 'source' ? (imageStoragePath.trim() || null) : null,
      audioUrl: role === 'source' ? (audioUrl.trim() || null) : null,
      audioStoragePath: role === 'source' ? (audioStoragePath.trim() || null) : null,
      selectedInput: (role === 'switcher' || role === 'router') ? (selectedInput || null) : null,
      multiviewLayout: role === 'multiview' ? multiviewLayout : null,
      multiviewPgmInput: role === 'multiview' ? (multiviewPgmInput || null) : null,
      multiviewPvwInput: role === 'multiview' ? (multiviewPvwInput || null) : null,
      type, role,
      pgmPort: role === 'switcher' ? (pgmPort || undefined) : undefined,
      normals: role === 'patchbay' ? normals : undefined,
      width,
      inputs: finalInputs.map(r => r.name),
      outputs: finalOutputs.map(r => r.name),
      inputsMeta, outputsMeta, physPorts,
    };
  };

  const handleSave = () => {
    onSave(buildUpdates());
  };

  const handleApplyToSelection = () => {
    if (!onSaveToSelection) return;
    // 장비 고유 식별 정보(name, groupId 등)은 제외하고 "공통 설정"만 전파
    const u = buildUpdates();
    const common: Partial<Device> = {
      type: u.type, role: u.role, width: u.width,
      model: u.model,
      pgmPort: u.pgmPort, normals: u.normals,
      location: u.location, roomNumber: u.roomNumber,
    };
    onSaveToSelection(common);
  };

  const sortedLayers = [...layers].sort((a, b) => a.sort_order - b.sort_order);

  const renderPortList = (dir: 'in' | 'out', rows: PortRow[]) => (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const layer = sortedLayers.find(l => l.id === r.layerId);
        return (
          <div key={i} className="group bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 hover:border-white/10 rounded-lg p-2 transition">
            {/* Line 1: port name + phys label + delete */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <input
                value={r.name}
                onChange={e => updatePort(dir, i, 'name', e.target.value)}
                placeholder="포트"
                className="bg-neutral-900 border border-white/10 rounded px-2 py-1.5 text-xs w-20 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none font-mono text-white font-semibold"
              />
              <input
                value={r.label}
                onChange={e => updatePort(dir, i, 'label', e.target.value)}
                placeholder="물리 이름 (예: CCU-1 OP-1)"
                className="bg-neutral-900 border border-white/10 rounded px-2 py-1.5 text-xs flex-1 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none min-w-0 text-neutral-200"
              />
              <button
                onClick={() => removePort(dir, i)}
                className="w-7 h-7 rounded bg-white/5 hover:bg-rose-500 text-neutral-500 hover:text-white text-sm transition shrink-0"
                title="포트 삭제"
              >−</button>
            </div>
            {/* Line 2: conn type + layer pill */}
            <div className="flex items-center gap-1.5 pl-1">
              <div className="flex items-center gap-1 flex-1">
                <span className="text-[9.5px] text-neutral-600 uppercase tracking-wider font-semibold">방식</span>
                <select
                  value={r.connType}
                  onChange={e => updatePort(dir, i, 'connType', e.target.value)}
                  className="bg-neutral-900 border border-white/10 rounded px-1.5 py-1 text-[11px] focus:border-sky-500 focus:outline-none text-neutral-200 font-mono"
                >
                  <option value="">-</option>
                  {CONNECTION_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9.5px] text-neutral-600 uppercase tracking-wider font-semibold">레이어</span>
                <div className="relative">
                  <select
                    value={r.layerId}
                    onChange={e => updatePort(dir, i, 'layerId', e.target.value)}
                    className="bg-neutral-900 border border-white/10 rounded pl-6 pr-2 py-1 text-[11px] focus:border-sky-500 focus:outline-none text-neutral-200 font-medium min-w-[120px]"
                    style={{ borderLeftColor: layer?.color, borderLeftWidth: 3 }}
                  >
                    {sortedLayers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <div
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded ring-1 ring-white/20 pointer-events-none"
                    style={{ background: layer?.color ?? '#888', boxShadow: `0 0 6px ${layer?.color ?? '#888'}88` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex gap-1.5 pt-1">
        <button
          onClick={() => addPort(dir)}
          className="flex-1 py-2 text-xs text-neutral-400 hover:text-white hover:bg-white/5 rounded-md border border-dashed border-white/15 hover:border-white/30 transition font-medium"
        >＋ 포트 추가</button>
        <select
          onChange={e => { if (e.target.value) { applyLayerToAll(dir, e.target.value); e.target.value = ''; } }}
          className="bg-neutral-900 border border-white/10 rounded px-3 py-2 text-[11px] text-neutral-400 focus:outline-none hover:text-white hover:border-white/20"
          defaultValue=""
          title="전체 포트를 선택한 레이어로 일괄 변경"
        >
          <option value="" disabled>⇔ 전체 레이어 일괄변경</option>
          {sortedLayers.map(l => <option key={l.id} value={l.id}>→ {l.name}</option>)}
        </select>
      </div>
    </div>
  );

  return (
    <div
      data-ui
      className={`fixed inset-y-0 right-0 w-[720px] bg-gradient-to-b from-neutral-950 via-neutral-950 to-black border-l border-white/10 shadow-2xl z-50 overflow-y-auto custom-scroll`}
    >
      {/* Header */}
      <div className={`sticky top-0 z-10 bg-gradient-to-r ${accent.grad} to-neutral-950 backdrop-blur-xl border-b border-white/10`}>
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 rounded-full" style={{ background: `linear-gradient(180deg, ${accent.dot}, ${accent.dot}80)` }}></div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight">장비 편집</h2>
              <div className="text-[10px] text-neutral-500 font-mono">{device.id}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition flex items-center justify-center text-sm">✕</button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Name */}
        {/* Name */}
        <div>
          <label className="block text-[10px] uppercase tracking-[0.12em] text-neutral-500 mb-2 font-semibold">장비명</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="예: Main Video Switcher"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm font-medium text-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition"
          />
        </div>

        {/* Model */}
        <div>
          <label className="block text-[10px] uppercase tracking-[0.12em] text-neutral-500 mb-2 font-semibold">
            모델명 <span className="text-neutral-600 normal-case tracking-normal ml-1 font-normal">제조사/품번 (장비카드에 작게 표시)</span>
          </label>
          <input
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="예: Sony XVS-G1 / Allen & Heath AVANTIS 48/16 / ADC PPS3"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2 text-[13px] font-mono text-neutral-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition"
          />
        </div>

        {/* Type + Width */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.12em] text-neutral-500 mb-2 font-semibold">타입</label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-white/5 rounded-lg border border-white/10">
              {(['video','audio','combined'] as const).map(t => {
                const a = TYPE_ACCENT[t];
                const active = type === t;
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`py-1.5 text-[11px] rounded-md font-medium transition ${active ? 'text-white shadow-sm' : 'text-neutral-500 hover:text-white'}`}
                    style={active ? { background: a.dot, boxShadow: `0 0 12px ${a.dot}80` } : undefined}
                  >
                    {t === 'video' ? 'Video' : t === 'audio' ? 'Audio' : 'V+A'}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.12em] text-neutral-500 mb-2 font-semibold">
              <span>크기</span>
              <span className="text-neutral-300 font-mono text-[10px] normal-case tracking-normal">{width}px</span>
            </label>
            <input type="range" min="140" max="420" step="10" value={width} onChange={e => setWidth(Number(e.target.value))} className="w-full h-6 accent-sky-500" />
          </div>
        </div>

        {/* Role picker */}
        <div>
          <label className="block text-[10px] uppercase tracking-[0.12em] text-neutral-500 mb-2 font-semibold">
            역할 <span className="text-neutral-600 normal-case tracking-normal ml-1">Device Role</span>
          </label>
          <div className="grid grid-cols-3 gap-1 p-1 bg-white/5 rounded-lg border border-white/10">
            {DEVICE_ROLES.map(r => {
              const active = role === r;
              const icon =
                r === 'switcher' ? '⇆'
                : r === 'router' ? '⇅'
                : r === 'splitter' ? '⇶'
                : r === 'patchbay' ? '⊟'
                : r === 'wallbox' ? '▦'
                : r === 'source' ? '▶'
                : r === 'display' ? '🖵'
                : r === 'connector' ? '━'
                : '◻';
              return (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`py-1.5 text-[10.5px] rounded-md font-medium transition flex items-center justify-center gap-1 ${active ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30' : 'text-neutral-500 hover:text-white'}`}
                >
                  <span className="text-[12px]">{icon}</span>
                  <span>{DEVICE_ROLE_LABELS[r]}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 text-[10px] text-neutral-600 leading-relaxed">
            {role === 'switcher' && '⇆ 여러 입력 중 선택된 소스를 출력으로. PGM 출력 + 현재 선택된 입력 지정.'}
            {role === 'router' && '⇅ 지정된 입력을 출력으로 라우팅.'}
            {role === 'splitter' && '⇶ 하나의 입력을 여러 출력으로 분배 (VDA/DA).'}
            {role === 'patchbay' && '⊟ 물리 패치베이. 기본 배선(normal)과 수동 패치(patch) 구분.'}
            {role === 'wallbox' && '▦ 벽면 판넬 월박스. 현장 장소별 포트 접점.'}
            {role === 'source' && '▶ 신호 소스 (카메라, 플레이어 등). 이미지를 올리면 디스플레이에 재생됨.'}
            {role === 'display' && '🖵 신호 디스플레이 (모니터, 벽). 연결된 소스의 이미지를 표시.'}
            {role === 'multiview' && '▦ 멀티뷰 모니터. 여러 입력 신호를 한 화면에 PGM/PVW/소스로 배치해 동시 표시.'}
            {role === 'connector' && '━ 통과 장비 (케이블, 변환기). 신호를 그대로 흘려보냄.'}
            {role === 'standard' && '◻ 일반 장비. 1:1 포트 매핑.'}
          </div>
        </div>

        {/* PGM Port (switcher only) */}
        {role === 'switcher' && (
          <div className="bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-lg p-3">
            <label className="block text-[10px] uppercase tracking-[0.12em] text-emerald-400 mb-2 font-semibold">
              📺 PGM 출력 포트
              <span className="text-neutral-500 normal-case tracking-normal ml-1 font-normal">현재 송출중인 출력</span>
            </label>
            <select
              value={pgmPort}
              onChange={e => setPgmPort(e.target.value)}
              className="w-full bg-neutral-900 border border-emerald-500/30 rounded px-3 py-2 text-sm font-mono text-emerald-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none"
            >
              <option value="">(지정 안함)</option>
              {outputs.map(o => (
                <option key={o.name} value={o.name}>{o.name}{o.label ? ` — ${o.label}` : ''}</option>
              ))}
            </select>
            <div className="mt-1.5 text-[10px] text-neutral-500">
              지정하면 장비카드에 「PGM」 뱃지가 붙고, 신호추적시 이 출력이 우선.
            </div>
          </div>
        )}

        {/* Source 업로드 — type에 따라 이미지/오디오/둘다 */}
        {role === 'source' && (
          <div className="space-y-2">
            {/* 이미지 업로드 (video/combined) */}
            {(type === 'video' || type === 'combined') && (
              <div className="bg-gradient-to-br from-lime-500/10 to-transparent border border-lime-500/20 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[15px]">🎥</span>
                  <div>
                    <div className="text-[11px] font-bold text-lime-300">비디오 소스 이미지</div>
                    <div className="text-[10px] text-neutral-500">디스플레이 화면에 표시됨</div>
                  </div>
                </div>

                {imageUrl ? (
                  <div className="relative group">
                    <img src={imageUrl} alt="Source preview"
                      className="w-full max-h-40 object-contain bg-black/60 rounded border border-lime-500/20" />
                    <button
                      onClick={async () => {
                        if (imageStoragePath) await (supabase as any).storage.from('device-images').remove([imageStoragePath]);
                        setImageUrl(''); setImageStoragePath('');
                      }}
                      className="absolute top-1 right-1 w-6 h-6 rounded bg-rose-500/90 hover:bg-rose-500 text-white text-[11px] opacity-0 group-hover:opacity-100 transition"
                      title="이미지 제거"
                    >✕</button>
                  </div>
                ) : (
                  <div className="text-[10px] text-neutral-500 italic py-2 text-center bg-black/30 rounded">
                    이미지가 없음
                  </div>
                )}

                <label className={`block w-full cursor-pointer ${uploadingImage ? 'opacity-50 pointer-events-none' : ''}`}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingImage(true);
                      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                      const path = `${device.id}/image_${Date.now()}_${safeName}`;
                      const { error } = await (supabase as any).storage
                        .from('device-images').upload(path, file, { cacheControl: '3600', upsert: false });
                      if (error) {
                        alert(`업로드 실패: ${error.message}\n\n"device-images" 버킷이 있는지 확인 (schema.sql 실행)`);
                        console.error(error);
                      } else {
                        if (imageStoragePath) await (supabase as any).storage.from('device-images').remove([imageStoragePath]);
                        const { data: pub } = (supabase as any).storage.from('device-images').getPublicUrl(path);
                        setImageUrl(pub.publicUrl);
                        setImageStoragePath(path);
                      }
                      setUploadingImage(false);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                  <div className="w-full py-1.5 text-center text-[11px] font-medium rounded bg-lime-500/20 hover:bg-lime-500/35 text-lime-200 border border-lime-500/30 transition">
                    {uploadingImage ? '⏳ 업로드 중...' : imageUrl ? '🖼 이미지 교체' : '📤 이미지 업로드'}
                  </div>
                </label>

                <input
                  type="url"
                  value={imageUrl}
                  onChange={e => { setImageUrl(e.target.value); setImageStoragePath(''); }}
                  placeholder="또는 외부 URL: https://example.com/image.jpg"
                  className="w-full bg-neutral-900 border border-lime-500/20 rounded px-2 py-1 text-[11px] font-mono text-neutral-200 focus:border-lime-400 focus:outline-none"
                />
              </div>
            )}

            {/* 오디오 업로드 (audio/combined) */}
            {(type === 'audio' || type === 'combined') && (
              <div className="bg-gradient-to-br from-rose-500/10 to-transparent border border-rose-500/20 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[15px]">🎵</span>
                  <div>
                    <div className="text-[11px] font-bold text-rose-300">오디오 소스 음원</div>
                    <div className="text-[10px] text-neutral-500">디스플레이에서 재생됨</div>
                  </div>
                </div>

                {audioUrl ? (
                  <div className="relative group bg-black/60 rounded border border-rose-500/20 p-2">
                    <audio src={audioUrl} controls className="w-full h-8" />
                    <button
                      onClick={async () => {
                        if (audioStoragePath) await (supabase as any).storage.from('device-images').remove([audioStoragePath]);
                        setAudioUrl(''); setAudioStoragePath('');
                      }}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500/90 hover:bg-rose-500 text-white text-[10px] opacity-0 group-hover:opacity-100 transition"
                      title="음원 제거"
                    >✕</button>
                  </div>
                ) : (
                  <div className="text-[10px] text-neutral-500 italic py-2 text-center bg-black/30 rounded">
                    음원이 없음
                  </div>
                )}

                <label className={`block w-full cursor-pointer ${uploadingAudio ? 'opacity-50 pointer-events-none' : ''}`}>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingAudio(true);
                      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                      const path = `${device.id}/audio_${Date.now()}_${safeName}`;
                      const { error } = await (supabase as any).storage
                        .from('device-images').upload(path, file, { cacheControl: '3600', upsert: false });
                      if (error) {
                        alert(`음원 업로드 실패: ${error.message}`);
                        console.error(error);
                      } else {
                        if (audioStoragePath) await (supabase as any).storage.from('device-images').remove([audioStoragePath]);
                        const { data: pub } = (supabase as any).storage.from('device-images').getPublicUrl(path);
                        setAudioUrl(pub.publicUrl);
                        setAudioStoragePath(path);
                      }
                      setUploadingAudio(false);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                  <div className="w-full py-1.5 text-center text-[11px] font-medium rounded bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-500/30 transition">
                    {uploadingAudio ? '⏳ 업로드 중...' : audioUrl ? '🎵 음원 교체' : '📤 음원 업로드 (.mp3, .wav, .ogg)'}
                  </div>
                </label>

                <input
                  type="url"
                  value={audioUrl}
                  onChange={e => { setAudioUrl(e.target.value); setAudioStoragePath(''); }}
                  placeholder="또는 외부 URL: https://example.com/sound.mp3"
                  className="w-full bg-neutral-900 border border-rose-500/20 rounded px-2 py-1 text-[11px] font-mono text-neutral-200 focus:border-rose-400 focus:outline-none"
                />
              </div>
            )}
          </div>
        )}

        {/* Switcher/Router 현재 선택 입력 */}
        {(role === 'switcher' || role === 'router') && inputs.length > 0 && (
          <div className="bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/20 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[15px]">{role === 'switcher' ? '⇆' : '⇅'}</span>
              <div>
                <div className="text-[11px] font-bold text-cyan-300">현재 선택된 입력 (시뮬레이션)</div>
                <div className="text-[10px] text-neutral-500">
                  {role === 'switcher'
                    ? '이 입력의 신호가 PGM/모든 출력으로 나감'
                    : '이 입력의 신호가 출력으로 전달됨'}
                </div>
              </div>
            </div>
            <select
              value={selectedInput}
              onChange={e => setSelectedInput(e.target.value)}
              className="w-full bg-neutral-900 border border-cyan-500/30 rounded px-2 py-1.5 text-[12px] font-mono text-cyan-100 focus:border-cyan-400 focus:outline-none"
            >
              <option value="">(선택 없음 — 신호 없음)</option>
              {inputs.map(i => (
                <option key={i.name} value={i.name}>
                  {i.name}{i.label ? ` — ${i.label}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 멀티뷰 설정 */}
        {role === 'multiview' && (
          <div className="bg-gradient-to-br from-violet-500/10 to-transparent border border-violet-500/20 rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[15px]">▦</span>
              <div>
                <div className="text-[11px] font-bold text-violet-300">멀티뷰 모니터 설정</div>
                <div className="text-[10px] text-neutral-500">여러 소스를 한 화면에 동시 표시. 입력 포트로 신호 받음.</div>
              </div>
            </div>

            {/* 레이아웃 선택 */}
            <div>
              <label className="text-[10px] font-semibold text-violet-300 uppercase tracking-wider block mb-1">레이아웃</label>
              <select
                value={multiviewLayout}
                onChange={e => setMultiviewLayout(e.target.value as MultiviewLayoutId)}
                className="w-full bg-neutral-900 border border-violet-500/30 rounded px-2 py-1.5 text-[12px] text-violet-100 focus:border-violet-400 focus:outline-none"
              >
                {(Object.entries(MULTIVIEW_LAYOUTS) as Array<[MultiviewLayoutId, typeof MULTIVIEW_LAYOUTS[MultiviewLayoutId]]>).map(([id, info]) => (
                  <option key={id} value={id}>{info.label}</option>
                ))}
              </select>
              <div className="text-[9.5px] text-neutral-500 mt-1">
                {MULTIVIEW_LAYOUTS[multiviewLayout].sourceCells}개의 소스 모니터 셀 사용 가능
              </div>
            </div>

            {/* PGM / PVW 선택 */}
            {inputs.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider block mb-1">PGM (방송중)</label>
                  <select
                    value={multiviewPgmInput}
                    onChange={e => setMultiviewPgmInput(e.target.value)}
                    className="w-full bg-neutral-900 border border-emerald-500/30 rounded px-2 py-1.5 text-[11px] font-mono text-emerald-100 focus:border-emerald-400 focus:outline-none"
                  >
                    <option value="">(없음)</option>
                    {inputs.map(i => (
                      <option key={i.name} value={i.name}>
                        {i.name}{i.label ? ` — ${i.label}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider block mb-1">PVW (대기)</label>
                  <select
                    value={multiviewPvwInput}
                    onChange={e => setMultiviewPvwInput(e.target.value)}
                    className="w-full bg-neutral-900 border border-amber-500/30 rounded px-2 py-1.5 text-[11px] font-mono text-amber-100 focus:border-amber-400 focus:outline-none"
                  >
                    <option value="">(없음)</option>
                    {inputs.map(i => (
                      <option key={i.name} value={i.name}>
                        {i.name}{i.label ? ` — ${i.label}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="text-[10px] text-violet-200/70 bg-violet-500/5 border border-violet-500/15 rounded p-2">
              💡 <span className="font-semibold">소스 모니터</span>는 PGM/PVW로 선택되지 않은 IN 포트들이 자동으로 순서대로 채워집니다.
            </div>
          </div>
        )}


        {/* Wallbox 전용 설정 */}
        {role === 'wallbox' && (
          <div className="bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[15px]">▦</span>
              <div>
                <div className="text-[11px] font-bold text-amber-300">월박스 설정</div>
                <div className="text-[10px] text-neutral-500">설치 장소와 방번호를 지정하면 월박스 관리 페이지에서 그룹핑됨</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.12em] text-amber-400 mb-1 font-semibold">
                  설치 장소
                </label>
                <input
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="예: 주경기장 / 중계석#1 / PC 존"
                  list="wallbox-locations"
                  className="w-full bg-neutral-900 border border-amber-500/30 rounded px-3 py-1.5 text-[12px] text-amber-100 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20 focus:outline-none"
                />
                <datalist id="wallbox-locations">
                  <option value="주경기장" />
                  <option value="보조경기장" />
                  <option value="중계석#1" />
                  <option value="중계석#2" />
                  <option value="PC 존" />
                  <option value="크로마실" />
                  <option value="선수대기실-1" />
                  <option value="선수대기실-2" />
                  <option value="선수대기실-3" />
                  <option value="A팀 선수석" />
                  <option value="B팀 선수석" />
                  <option value="부조정실" />
                  <option value="음저버" />
                </datalist>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.12em] text-amber-400 mb-1 font-semibold">
                  방 번호 / 태그
                </label>
                <input
                  value={roomNumber}
                  onChange={e => setRoomNumber(e.target.value)}
                  placeholder="예: WB-101, OBS-01"
                  className="w-full bg-neutral-900 border border-amber-500/30 rounded px-3 py-1.5 text-[12px] font-mono text-amber-100 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}
        {role === 'patchbay' && (
          <div className="bg-gradient-to-br from-teal-500/10 to-transparent border border-teal-500/20 rounded-lg p-3 space-y-2.5">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.12em] text-teal-300 font-semibold">
                ⊟ Normal 매핑
                <span className="text-neutral-500 normal-case tracking-normal ml-1 font-normal">IN → OUT 기본 통로</span>
              </label>
              <div className="text-[10px] text-neutral-500 mt-1">
                Normal은 패치 케이블 <b className="text-teal-300">연결 안됐을 때 기본 배선</b> (normal-thru). 
                외부에서 IN으로 들어온 신호는 매핑된 OUT으로 그대로 나감.
                수동으로 꽂은 케이블(patch)은 여기서 설정한 normal을 <b className="text-amber-300">끊고</b> 대신 지나감.
              </div>
            </div>

            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  // 1:1 자동 매핑 (IN-01 → OUT-01 ...)
                  const map: Record<string, string> = {};
                  inputs.forEach((inp, idx) => {
                    if (outputs[idx]) map[inp.name] = outputs[idx].name;
                  });
                  setNormals(map);
                }}
                className="flex-1 py-1.5 text-[11px] rounded-md bg-teal-500/20 hover:bg-teal-500/35 text-teal-200 font-medium border border-teal-500/30 transition"
              >🔗 1:1 자동매핑</button>
              <button
                onClick={() => setNormals({})}
                className="flex-1 py-1.5 text-[11px] rounded-md bg-white/5 hover:bg-rose-500/40 text-neutral-400 hover:text-white font-medium border border-white/10 transition"
              >✕ 전체 해제</button>
            </div>

            <div className="max-h-64 overflow-y-auto custom-scroll space-y-1 pr-1">
              {inputs.map((inp, i) => {
                const mapped = normals[inp.name] ?? '';
                return (
                  <div key={inp.name} className="flex items-center gap-1.5 bg-black/30 rounded p-1.5 border border-white/5">
                    <span className="text-[10.5px] font-mono text-neutral-300 w-20 truncate">{inp.name}</span>
                    <span className="text-teal-400 text-[12px]">→</span>
                    <select
                      value={mapped}
                      onChange={e => {
                        const v = e.target.value;
                        setNormals(prev => {
                          const next = { ...prev };
                          if (v) next[inp.name] = v;
                          else delete next[inp.name];
                          return next;
                        });
                      }}
                      className="flex-1 bg-neutral-900 border border-white/10 rounded px-2 py-1 text-[11px] font-mono text-teal-200 focus:border-teal-400 focus:outline-none"
                    >
                      <option value="">(normal 없음 — 통로 없음)</option>
                      {outputs.map(o => <option key={o.name} value={o.name}>{o.name}{o.label ? ` — ${o.label}` : ''}</option>)}
                    </select>
                  </div>
                );
              })}
              {inputs.length === 0 && (
                <div className="text-center py-4 text-[10px] text-neutral-600">
                  입력 포트를 먼저 추가하세요
                </div>
              )}
            </div>

            <div className="text-[10px] text-neutral-500 bg-black/20 rounded p-2 leading-relaxed">
              💡 <b className="text-teal-300">Normal-thru</b>: 매핑된 IN/OUT은 기본적으로 연결됨 (실선 · 부드러운 tint).<br/>
              💡 <b className="text-amber-300">Patch(수동)</b>: 케이블 생성 후 해당 케이블의 <code className="text-amber-200">is_patch</code> 플래그를 켜면 주황 점선 + normal 끊김.
            </div>
          </div>
        )}

        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-black/30 p-1 rounded-lg border border-white/5">
          <button onClick={() => setBulkMode('list')}
            className={`flex-1 py-2 text-xs rounded-md transition font-medium ${bulkMode === 'list' ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-lg shadow-sky-500/30' : 'text-neutral-500 hover:text-white'}`}
          >리스트 + 버튼</button>
          <button onClick={() => setBulkMode('text')}
            className={`flex-1 py-2 text-xs rounded-md transition font-medium ${bulkMode === 'text' ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-lg shadow-sky-500/30' : 'text-neutral-500 hover:text-white'}`}
          >텍스트 일괄</button>
        </div>

        {bulkMode === 'list' ? (
          <>
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-1 h-4 bg-gradient-to-b from-sky-400 to-sky-600 rounded-full"></div>
                <h3 className="text-[11px] uppercase tracking-[0.12em] text-sky-300 font-bold">입력 포트</h3>
                <div className="flex items-center gap-0.5 bg-black/30 border border-sky-500/20 rounded-md p-0.5">
                  <button
                    onClick={() => setPortCount('in', inputs.length - 1)}
                    className="w-5 h-5 text-[11px] rounded hover:bg-sky-500/30 text-sky-300 hover:text-white transition"
                    title="-1"
                  >−</button>
                  <input
                    type="number"
                    value={inputs.length}
                    onChange={e => setPortCount('in', Number(e.target.value))}
                    min={0}
                    max={128}
                    className="w-10 bg-transparent text-center text-[11px] font-mono text-sky-200 font-bold focus:outline-none focus:bg-sky-500/10 rounded"
                    title="정확한 개수 입력"
                  />
                  <button
                    onClick={() => setPortCount('in', inputs.length + 1)}
                    className="w-5 h-5 text-[11px] rounded hover:bg-sky-500/30 text-sky-300 hover:text-white transition"
                    title="+1"
                  >+</button>
                </div>
                <span className="text-[10px] text-neutral-500 font-mono">개</span>
                <div className="flex-1 border-t border-white/5"></div>
              </div>
              {renderPortList('in', inputs)}
            </div>
            <div className="pt-1">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-1 h-4 bg-gradient-to-b from-orange-400 to-orange-600 rounded-full"></div>
                <h3 className="text-[11px] uppercase tracking-[0.12em] text-orange-300 font-bold">출력 포트</h3>
                <div className="flex items-center gap-0.5 bg-black/30 border border-orange-500/20 rounded-md p-0.5">
                  <button
                    onClick={() => setPortCount('out', outputs.length - 1)}
                    className="w-5 h-5 text-[11px] rounded hover:bg-orange-500/30 text-orange-300 hover:text-white transition"
                    title="-1"
                  >−</button>
                  <input
                    type="number"
                    value={outputs.length}
                    onChange={e => setPortCount('out', Number(e.target.value))}
                    min={0}
                    max={128}
                    className="w-10 bg-transparent text-center text-[11px] font-mono text-orange-200 font-bold focus:outline-none focus:bg-orange-500/10 rounded"
                    title="정확한 개수 입력"
                  />
                  <button
                    onClick={() => setPortCount('out', outputs.length + 1)}
                    className="w-5 h-5 text-[11px] rounded hover:bg-orange-500/30 text-orange-300 hover:text-white transition"
                    title="+1"
                  >+</button>
                </div>
                <span className="text-[10px] text-neutral-500 font-mono">개</span>
                <div className="flex-1 border-t border-white/5"></div>
              </div>
              {renderPortList('out', outputs)}
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.12em] text-neutral-500 mb-2 font-semibold">입력 포트 (쉼표 구분)</label>
              <textarea value={bulkInputs} onChange={e => setBulkInputs(e.target.value)} rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-neutral-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.12em] text-neutral-500 mb-2 font-semibold">출력 포트 (쉼표 구분)</label>
              <textarea value={bulkOutputs} onChange={e => setBulkOutputs(e.target.value)} rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-neutral-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none" />
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-3 border-t border-white/5">
          <button onClick={handleSave}
            className="flex-1 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white py-2.5 text-sm rounded-lg font-semibold shadow-lg shadow-sky-500/30 transition">저장</button>
          {selectionCount && selectionCount > 1 && onSaveToSelection && (
            <button onClick={handleApplyToSelection}
              className="px-3 bg-purple-500/15 hover:bg-purple-500 text-purple-300 hover:text-white py-2.5 text-sm rounded-lg font-medium border border-purple-500/30 hover:border-purple-400 transition flex items-center gap-1"
              title={`이 설정을 선택된 ${selectionCount}개 장비에 적용 (이름·그룹 제외)`}>
              <span>📤</span>
              <span className="text-[11px] leading-none">선택 {selectionCount}개에<br/>적용</span>
            </button>
          )}
          <button onClick={onDuplicate}
            className="px-4 bg-purple-500/15 hover:bg-purple-500 text-purple-300 hover:text-white py-2.5 text-sm rounded-lg font-medium border border-purple-500/30 hover:border-purple-400 transition flex items-center gap-1.5"
            title="같은 속성으로 장비 복제 (연결은 제외)">
            <span>⎘</span>
            <span>복제</span>
          </button>
          <button onClick={() => { if (confirm('정말 삭제?')) onDelete(); }}
            className="px-4 bg-rose-500/10 hover:bg-rose-500 text-rose-300 hover:text-white py-2.5 text-sm rounded-lg font-medium border border-rose-500/30 hover:border-rose-500 transition">삭제</button>
        </div>
      </div>
    </div>
  );
}
