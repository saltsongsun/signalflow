'use client';
import { useState, useEffect } from 'react';
import { Device, CONNECTION_TYPES, ConnectionType, PortInfo, Layer } from '../lib/supabase';

type Props = {
  device: Device;
  layers: Layer[];
  onSave: (updates: Partial<Device>) => void;
  onDelete: () => void;
  onClose: () => void;
};

type PortRow = { name: string; label: string; connType: ConnectionType | ''; layerId: string };

export default function DeviceEditor({ device, layers, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(device.name);
  const [type, setType] = useState<Device['type']>(device.type);
  const [width, setWidth] = useState(device.width ?? 200);
  const [inputs, setInputs] = useState<PortRow[]>([]);
  const [outputs, setOutputs] = useState<PortRow[]>([]);
  const [bulkMode, setBulkMode] = useState<'list' | 'text'>('list');
  const [bulkInputs, setBulkInputs] = useState('');
  const [bulkOutputs, setBulkOutputs] = useState('');

  const defaultLayerId = layers[0]?.id ?? 'layer_video';

  useEffect(() => {
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
    const row: PortRow = {
      name: `${dir === 'in' ? 'IN' : 'OUT'}-${nextIdx}`,
      label: '', connType: '', layerId: defaultLayerId,
    };
    if (dir === 'in') setInputs([...inputs, row]);
    else setOutputs([...outputs, row]);
  };
  const removePort = (dir: 'in' | 'out', i: number) => {
    if (dir === 'in') setInputs(inputs.filter((_, idx) => idx !== i));
    else setOutputs(outputs.filter((_, idx) => idx !== i));
  };
  const updatePort = (dir: 'in' | 'out', i: number, field: keyof PortRow, value: string) => {
    const update = (arr: PortRow[]) => arr.map((r, idx) => idx === i ? { ...r, [field]: value } : r);
    if (dir === 'in') setInputs(update(inputs));
    else setOutputs(update(outputs));
  };

  // 모든 포트 레이어 일괄 변경
  const applyLayerToAll = (dir: 'in' | 'out', layerId: string) => {
    if (dir === 'in') setInputs(inputs.map(r => ({ ...r, layerId })));
    else setOutputs(outputs.map(r => ({ ...r, layerId })));
  };

  const handleSave = () => {
    let finalInputs: PortRow[], finalOutputs: PortRow[];
    if (bulkMode === 'text') {
      finalInputs = bulkInputs.split(',').map(s => s.trim()).filter(Boolean)
        .map(n => { const existing = inputs.find(x => x.name === n); return existing ?? { name: n, label: '', connType: '', layerId: defaultLayerId }; });
      finalOutputs = bulkOutputs.split(',').map(s => s.trim()).filter(Boolean)
        .map(n => { const existing = outputs.find(x => x.name === n); return existing ?? { name: n, label: '', connType: '', layerId: defaultLayerId }; });
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
      type, width,
      inputs: finalInputs.map(r => r.name),
      outputs: finalOutputs.map(r => r.name),
      inputsMeta, outputsMeta, physPorts,
    });
  };

  const sortedLayers = [...layers].sort((a, b) => a.sort_order - b.sort_order);

  const renderPortList = (dir: 'in' | 'out', rows: PortRow[]) => (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 text-[10px] text-neutral-600 px-1">
        <span className="w-16">포트</span>
        <span className="flex-1">물리 이름</span>
        <span className="w-20">방식</span>
        <span className="w-20">레이어</span>
        <span className="w-6"></span>
      </div>
      {rows.map((r, i) => {
        const layer = sortedLayers.find(l => l.id === r.layerId);
        return (
          <div key={i} className="flex items-center gap-1 group">
            <input
              value={r.name}
              onChange={e => updatePort(dir, i, 'name', e.target.value)}
              placeholder="포트"
              className="bg-neutral-800 border border-neutral-700 rounded px-1.5 py-1 text-xs w-16 focus:border-sky-500 focus:outline-none font-mono"
            />
            <input
              value={r.label}
              onChange={e => updatePort(dir, i, 'label', e.target.value)}
              placeholder="CCU-1 OP-1"
              className="bg-neutral-800 border border-neutral-700 rounded px-1.5 py-1 text-xs flex-1 focus:border-sky-500 focus:outline-none min-w-0"
            />
            <select
              value={r.connType}
              onChange={e => updatePort(dir, i, 'connType', e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded px-1 py-1 text-xs w-20 focus:border-sky-500 focus:outline-none"
            >
              <option value="">-</option>
              {CONNECTION_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={r.layerId}
              onChange={e => updatePort(dir, i, 'layerId', e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded px-1 py-1 text-xs w-20 focus:border-sky-500 focus:outline-none"
              style={{ borderLeftColor: layer?.color, borderLeftWidth: 3 }}
            >
              {sortedLayers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button
              onClick={() => removePort(dir, i)}
              className="w-6 h-6 rounded bg-neutral-800 hover:bg-rose-600 text-neutral-400 hover:text-white text-sm"
            >−</button>
          </div>
        );
      })}
      <div className="flex gap-1.5">
        <button
          onClick={() => addPort(dir)}
          className="flex-1 py-1.5 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 rounded border border-dashed border-neutral-700 hover:border-neutral-500"
        >＋ 포트 추가</button>
        <select
          onChange={e => { if (e.target.value) { applyLayerToAll(dir, e.target.value); e.target.value = ''; } }}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-[10px] text-neutral-400 focus:outline-none"
          title="전체 포트를 선택한 레이어로 일괄 변경"
          defaultValue=""
        >
          <option value="" disabled>⇔ 전체 레이어 일괄</option>
          {sortedLayers.map(l => <option key={l.id} value={l.id}>→ {l.name}</option>)}
        </select>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-y-0 right-0 w-[620px] bg-neutral-950 border-l border-neutral-800 shadow-2xl z-50 overflow-y-auto">
      <div className="sticky top-0 bg-neutral-950 border-b border-neutral-800 px-5 py-3 flex items-center justify-between z-10">
        <h2 className="text-sm font-semibold text-white">장비 편집 <span className="text-neutral-500 font-normal ml-2">{device.id}</span></h2>
        <button onClick={onClose} className="w-7 h-7 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white">✕</button>
      </div>

      <div className="p-5 space-y-5">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-neutral-500 mb-1.5">장비명</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-neutral-500 mb-1.5">타입</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as Device['type'])}
              className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            >
              <option value="video">Video (파랑)</option>
              <option value="audio">Audio (빨강)</option>
              <option value="combined">Combined (보라)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-neutral-500 mb-1.5">
              가로 크기: {width}px
            </label>
            <input type="range" min="140" max="400" step="10" value={width} onChange={e => setWidth(Number(e.target.value))} className="w-full" />
          </div>
        </div>

        <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded">
          <button
            onClick={() => setBulkMode('list')}
            className={`flex-1 py-1.5 text-xs rounded ${bulkMode === 'list' ? 'bg-sky-600 text-white' : 'text-neutral-400'}`}
          >리스트 + 버튼</button>
          <button
            onClick={() => setBulkMode('text')}
            className={`flex-1 py-1.5 text-xs rounded ${bulkMode === 'text' ? 'bg-sky-600 text-white' : 'text-neutral-400'}`}
          >텍스트 일괄</button>
        </div>

        {bulkMode === 'list' ? (
          <>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">입력 포트 ({inputs.length})</div>
              {renderPortList('in', inputs)}
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">출력 포트 ({outputs.length})</div>
              {renderPortList('out', outputs)}
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-neutral-500 mb-1.5">입력 포트 (쉼표 구분)</label>
              <textarea value={bulkInputs} onChange={e => setBulkInputs(e.target.value)} rows={3} className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm font-mono focus:border-sky-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-neutral-500 mb-1.5">출력 포트 (쉼표 구분)</label>
              <textarea value={bulkOutputs} onChange={e => setBulkOutputs(e.target.value)} rows={3} className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm font-mono focus:border-sky-500 focus:outline-none" />
            </div>
          </>
        )}

        <div className="flex gap-2 pt-3 border-t border-neutral-800">
          <button onClick={handleSave} className="flex-1 bg-sky-600 hover:bg-sky-500 text-white py-2 text-sm rounded font-medium">저장</button>
          <button onClick={() => { if (confirm('정말 삭제?')) onDelete(); }} className="px-4 bg-rose-900/50 hover:bg-rose-600 text-rose-300 hover:text-white py-2 text-sm rounded font-medium">삭제</button>
        </div>
      </div>
    </div>
  );
}
