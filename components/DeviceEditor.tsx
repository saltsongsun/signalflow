'use client';
import { useState, useEffect } from 'react';
import { Device, CONNECTION_TYPES, ConnectionType, PortInfo, Layer, DEVICE_ROLES, DEVICE_ROLE_LABELS, DeviceRole } from '../lib/supabase';

type Props = {
  device: Device;
  layers: Layer[];
  onSave: (updates: Partial<Device>) => void;
  onDelete: () => void;
  onClose: () => void;
};

type PortRow = { name: string; label: string; connType: ConnectionType | ''; layerId: string };

const TYPE_ACCENT = {
  video:    { grad: 'from-sky-500/20 to-sky-600/5',     ring: 'ring-sky-500/40',    dot: '#3B82F6' },
  audio:    { grad: 'from-rose-500/20 to-rose-600/5',   ring: 'ring-rose-500/40',   dot: '#EF4444' },
  combined: { grad: 'from-purple-500/20 to-purple-600/5', ring: 'ring-purple-500/40', dot: '#A855F7' },
};

export default function DeviceEditor({ device, layers, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(device.name);
  const [type, setType] = useState<Device['type']>(device.type);
  const [role, setRole] = useState<DeviceRole>(device.role ?? 'standard');
  const [pgmPort, setPgmPort] = useState<string>(device.pgmPort ?? '');
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
    setType(device.type);
    setRole(device.role ?? 'standard');
    setPgmPort(device.pgmPort ?? '');
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

  const handleSave = () => {
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
    onSave({
      name: name.trim() || device.name,
      type, role,
      pgmPort: role === 'switcher' ? (pgmPort || undefined) : undefined,
      width,
      inputs: finalInputs.map(r => r.name),
      outputs: finalOutputs.map(r => r.name),
      inputsMeta, outputsMeta, physPorts,
    });
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
        <div>
          <label className="block text-[10px] uppercase tracking-[0.12em] text-neutral-500 mb-2 font-semibold">장비명</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm font-medium text-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition"
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
          <div className="grid grid-cols-4 gap-1 p-1 bg-white/5 rounded-lg border border-white/10">
            {DEVICE_ROLES.map(r => {
              const active = role === r;
              const icon = r === 'switcher' ? '⇆' : r === 'router' ? '⇅' : r === 'splitter' ? '⇶' : '◻';
              return (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`py-1.5 text-[11px] rounded-md font-medium transition flex items-center justify-center gap-1 ${active ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30' : 'text-neutral-500 hover:text-white'}`}
                >
                  <span className="text-[12px]">{icon}</span>
                  <span>{DEVICE_ROLE_LABELS[r]}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 text-[10px] text-neutral-600 leading-relaxed">
            {role === 'switcher' && '⇆ 여러 입력 중 선택된 소스를 출력으로 보냄. PGM 출력 지정 가능.'}
            {role === 'router' && '⇅ 모든 입력을 모든 출력으로 자유롭게 라우팅.'}
            {role === 'splitter' && '⇶ 하나의 입력을 여러 출력으로 분배 (VDA/DA).'}
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
                <span className="text-[10px] text-neutral-500 font-mono">{inputs.length}개</span>
                <div className="flex-1 border-t border-white/5"></div>
              </div>
              {renderPortList('in', inputs)}
            </div>
            <div className="pt-1">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-1 h-4 bg-gradient-to-b from-orange-400 to-orange-600 rounded-full"></div>
                <h3 className="text-[11px] uppercase tracking-[0.12em] text-orange-300 font-bold">출력 포트</h3>
                <span className="text-[10px] text-neutral-500 font-mono">{outputs.length}개</span>
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
          <button onClick={() => { if (confirm('정말 삭제?')) onDelete(); }}
            className="px-5 bg-rose-500/10 hover:bg-rose-500 text-rose-300 hover:text-white py-2.5 text-sm rounded-lg font-medium border border-rose-500/30 hover:border-rose-500 transition">삭제</button>
        </div>
      </div>
    </div>
  );
}
