'use client';
import { useState } from 'react';
import { Device, Layer, CONNECTION_TYPES, ConnectionType, DEVICE_ROLES, DEVICE_ROLE_LABELS, DeviceRole, supabase } from '../lib/supabase';

type Props = {
  devices: Device[];             // 대상 장비들
  layers: Layer[];
  onClose: () => void;
};

// 적용할 필드 목록
type FieldKey =
  | 'type' | 'role' | 'width' | 'model'
  | 'location' | 'roomNumber'
  | 'portsLayer' | 'portsConnType'
  | 'groupName';

export default function BulkEditor({ devices, layers, onClose }: Props) {
  const [enabled, setEnabled] = useState<Record<FieldKey, boolean>>({
    type: false, role: false, width: false, model: false,
    location: false, roomNumber: false,
    portsLayer: false, portsConnType: false,
    groupName: false,
  });

  const [type, setType] = useState<Device['type']>(devices[0]?.type ?? 'video');
  const [role, setRole] = useState<DeviceRole>(devices[0]?.role ?? 'standard');
  const [width, setWidth] = useState<number>(devices[0]?.width ?? 200);
  const [model, setModel] = useState<string>(devices[0]?.model ?? '');
  const [location, setLocation] = useState<string>(devices[0]?.location ?? '');
  const [roomNumber, setRoomNumber] = useState<string>(devices[0]?.roomNumber ?? '');
  const [portsLayer, setPortsLayer] = useState<string>(layers[0]?.id ?? 'layer_video');
  const [portsConnType, setPortsConnType] = useState<ConnectionType | ''>('');
  const [groupName, setGroupName] = useState<string>(devices[0]?.groupName ?? '');

  const [saving, setSaving] = useState(false);

  const toggle = (k: FieldKey) => setEnabled(e => ({ ...e, [k]: !e[k] }));

  const apply = async () => {
    const activeKeys = (Object.keys(enabled) as FieldKey[]).filter(k => enabled[k]);
    if (activeKeys.length === 0) {
      alert('적용할 필드를 한 개 이상 선택하세요');
      return;
    }
    setSaving(true);

    for (const d of devices) {
      const updates: any = {};

      if (enabled.type) updates.type = type;
      if (enabled.role) updates.role = role;
      if (enabled.width) updates.width = width;
      if (enabled.model) updates.model = model.trim() || null;
      if (enabled.location) updates.location = location.trim() || null;
      if (enabled.roomNumber) updates.roomNumber = roomNumber.trim() || null;

      // 그룹 이름 (동일 groupId 유지, 이름만 바꿈)
      if (enabled.groupName) updates.groupName = groupName.trim() || null;

      // 포트 레이어/연결방식 - 모든 포트에 적용
      if (enabled.portsLayer || enabled.portsConnType) {
        const inMeta: any = { ...(d.inputsMeta ?? {}) };
        const outMeta: any = { ...(d.outputsMeta ?? {}) };
        d.inputs.forEach(p => {
          inMeta[p] = { ...(inMeta[p] ?? { name: p }) };
          if (enabled.portsLayer) inMeta[p].layerId = portsLayer;
          if (enabled.portsConnType) inMeta[p].connType = portsConnType || undefined;
        });
        d.outputs.forEach(p => {
          outMeta[p] = { ...(outMeta[p] ?? { name: p }) };
          if (enabled.portsLayer) outMeta[p].layerId = portsLayer;
          if (enabled.portsConnType) outMeta[p].connType = portsConnType || undefined;
        });
        updates.inputsMeta = inMeta;
        updates.outputsMeta = outMeta;
      }

      const { error } = await (supabase as any).from('devices').update(updates).eq('id', d.id);
      if (error) {
        console.error('[Bulk save error]', d.id, error);
      }
    }

    setSaving(false);
    onClose();
  };

  const FIELD_LABELS: Record<FieldKey, string> = {
    type: '장비 타입 (video/audio/combined)',
    role: '역할 (standard/switcher/router/splitter/patchbay/wallbox)',
    width: '장비 카드 폭',
    model: '모델명',
    location: '설치 장소 (월박스)',
    roomNumber: '방 번호 (월박스)',
    portsLayer: '모든 포트의 레이어',
    portsConnType: '모든 포트의 연결 방식',
    groupName: '그룹 이름 (같은 그룹 유지)',
  };

  return (
    <div data-ui className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-md flex items-center justify-center">
      <div className="w-[560px] max-h-[90vh] bg-gradient-to-b from-neutral-900 to-neutral-950 border border-white/15 rounded-xl shadow-2xl flex flex-col">
        {/* 헤더 */}
        <div className="px-5 py-3 border-b border-white/10 bg-gradient-to-r from-purple-500/10 to-transparent flex items-center gap-3">
          <div className="w-1 h-5 bg-gradient-to-b from-purple-400 to-purple-600 rounded-full"></div>
          <div className="flex-1">
            <div className="text-sm font-semibold">일괄 편집</div>
            <div className="text-[10px] text-neutral-500">
              <span className="text-purple-300 font-mono">{devices.length}</span>개 장비에 적용할 필드를 선택하세요
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded hover:bg-white/10 text-neutral-400">✕</button>
        </div>

        {/* 대상 목록 */}
        <div className="px-5 py-2 border-b border-white/5 bg-black/30">
          <div className="text-[10px] text-neutral-500 mb-1">대상</div>
          <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
            {devices.slice(0, 15).map(d => (
              <span key={d.id} className="text-[10px] px-1.5 py-[1px] rounded bg-purple-500/15 text-purple-200 border border-purple-500/25 font-mono">
                {d.name}
              </span>
            ))}
            {devices.length > 15 && <span className="text-[10px] text-neutral-500">외 {devices.length - 15}개</span>}
          </div>
        </div>

        {/* 필드 목록 - 스크롤 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2.5 custom-scroll">
          {/* 장비 타입 */}
          <FieldRow label={FIELD_LABELS.type} checked={enabled.type} onToggle={() => toggle('type')}>
            <div className="grid grid-cols-3 gap-1 w-full">
              {(['video', 'audio', 'combined'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  disabled={!enabled.type}
                  className={`py-1.5 text-[11px] rounded font-medium transition ${type === t ? 'bg-sky-500 text-white' : 'bg-white/5 text-neutral-400 hover:text-white'} disabled:opacity-40`}
                >{t}</button>
              ))}
            </div>
          </FieldRow>

          {/* 역할 */}
          <FieldRow label={FIELD_LABELS.role} checked={enabled.role} onToggle={() => toggle('role')}>
            <select
              value={role}
              onChange={e => setRole(e.target.value as DeviceRole)}
              disabled={!enabled.role}
              className="w-full bg-neutral-900 border border-white/10 rounded px-2 py-1.5 text-[12px] disabled:opacity-40"
            >
              {DEVICE_ROLES.map(r => <option key={r} value={r}>{DEVICE_ROLE_LABELS[r]}</option>)}
            </select>
          </FieldRow>

          {/* 폭 */}
          <FieldRow label={FIELD_LABELS.width} checked={enabled.width} onToggle={() => toggle('width')}>
            <div className="flex items-center gap-2 w-full">
              <input
                type="range" min="140" max="420" step="10"
                value={width}
                onChange={e => setWidth(Number(e.target.value))}
                disabled={!enabled.width}
                className="flex-1 accent-purple-500 disabled:opacity-40"
              />
              <span className="text-[11px] font-mono text-neutral-300 w-14 text-right">{width}px</span>
            </div>
          </FieldRow>

          {/* 모델명 */}
          <FieldRow label={FIELD_LABELS.model} checked={enabled.model} onToggle={() => toggle('model')}>
            <input
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="모델명 (비우면 제거)"
              disabled={!enabled.model}
              className="w-full bg-neutral-900 border border-white/10 rounded px-2 py-1.5 text-[12px] font-mono disabled:opacity-40"
            />
          </FieldRow>

          {/* 그룹 이름 */}
          <FieldRow label={FIELD_LABELS.groupName} checked={enabled.groupName} onToggle={() => toggle('groupName')}>
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="그룹 이름"
              disabled={!enabled.groupName}
              className="w-full bg-neutral-900 border border-white/10 rounded px-2 py-1.5 text-[12px] disabled:opacity-40"
            />
          </FieldRow>

          {/* 장소 / 방번호 */}
          <FieldRow label={FIELD_LABELS.location} checked={enabled.location} onToggle={() => toggle('location')}>
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="설치 장소"
              disabled={!enabled.location}
              className="w-full bg-neutral-900 border border-white/10 rounded px-2 py-1.5 text-[12px] disabled:opacity-40"
            />
          </FieldRow>
          <FieldRow label={FIELD_LABELS.roomNumber} checked={enabled.roomNumber} onToggle={() => toggle('roomNumber')}>
            <input
              value={roomNumber}
              onChange={e => setRoomNumber(e.target.value)}
              placeholder="방 번호"
              disabled={!enabled.roomNumber}
              className="w-full bg-neutral-900 border border-white/10 rounded px-2 py-1.5 text-[12px] font-mono disabled:opacity-40"
            />
          </FieldRow>

          {/* 포트 레이어 */}
          <FieldRow label={FIELD_LABELS.portsLayer} checked={enabled.portsLayer} onToggle={() => toggle('portsLayer')}>
            <select
              value={portsLayer}
              onChange={e => setPortsLayer(e.target.value)}
              disabled={!enabled.portsLayer}
              className="w-full bg-neutral-900 border border-white/10 rounded px-2 py-1.5 text-[12px] disabled:opacity-40"
            >
              {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </FieldRow>

          {/* 포트 연결방식 */}
          <FieldRow label={FIELD_LABELS.portsConnType} checked={enabled.portsConnType} onToggle={() => toggle('portsConnType')}>
            <select
              value={portsConnType}
              onChange={e => setPortsConnType(e.target.value as ConnectionType)}
              disabled={!enabled.portsConnType}
              className="w-full bg-neutral-900 border border-white/10 rounded px-2 py-1.5 text-[12px] font-mono disabled:opacity-40"
            >
              <option value="">(제거)</option>
              {CONNECTION_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FieldRow>
        </div>

        {/* 풋터 */}
        <div className="px-5 py-3 border-t border-white/10 bg-black/30 flex gap-2">
          <button
            onClick={apply}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 text-white text-sm font-semibold shadow-lg shadow-purple-500/30 disabled:opacity-50 transition"
          >
            {saving ? '적용 중...' : `✓ ${devices.length}개 장비에 적용`}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 text-sm border border-white/10 transition">취소</button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, checked, onToggle, children }: { label: string; checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className={`bg-white/[0.02] border rounded-lg p-2.5 transition ${checked ? 'border-purple-500/40 bg-purple-500/5' : 'border-white/5'}`}>
      <label className="flex items-start gap-2.5 cursor-pointer mb-1.5">
        <input type="checkbox" checked={checked} onChange={onToggle} className="mt-[3px] w-3.5 h-3.5 accent-purple-500" />
        <span className={`text-[11px] font-medium ${checked ? 'text-purple-200' : 'text-neutral-400'}`}>{label}</span>
      </label>
      <div className="ml-6">{children}</div>
    </div>
  );
}
