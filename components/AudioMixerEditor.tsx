'use client';
import { useState, useMemo } from 'react';
import { supabase, Device, AudioChannel, AudioBus, AudioBusType, AUDIO_BUS_TYPE_LABELS, AudioPatchEntry, AudioOutPatchEntry, MixMatrixCell } from '../lib/supabase';

type Tab = 'patch' | 'channels' | 'matrix' | 'output';

type Props = {
  device: Device;
  allDevices?: Device[];  // 연동 IO 박스 조회용
  onSave: (updates: Partial<Device>) => void;
  onClose: () => void;
};

// dB 레벨 ↔ 슬라이더 값 변환
const MIN_DB = -100;
const MAX_DB = 10;
const dbToPercent = (db: number) => ((db - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
const percentToDb = (p: number) => MIN_DB + (p / 100) * (MAX_DB - MIN_DB);

// 색상 팔레트 (채널/버스에 자동 할당)
const COLORS = ['#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#3B82F6', '#84CC16', '#F97316', '#A855F7'];

export default function AudioMixerEditor({ device, allDevices = [], onSave, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('matrix');
  const [channels, setChannels] = useState<AudioChannel[]>(device.audioChannels ?? []);
  const [buses, setBuses] = useState<AudioBus[]>(device.audioBuses ?? [
    { id: 'main', name: 'MAIN L/R', type: 'main', stereo: true, color: '#10B981' },
  ]);
  const [patch, setPatch] = useState<Record<string, AudioPatchEntry>>(device.audioPatch ?? {});
  const [outPatch, setOutPatch] = useState<Record<string, AudioOutPatchEntry>>(device.audioOutPatch ?? {});
  const [matrix, setMatrix] = useState<Record<string, Record<string, MixMatrixCell>>>(device.mixMatrix ?? {});

  // ===== 입력 풀: 콘솔 본체 IN + 연동된 IO 박스의 IN =====
  // 출력 풀: 콘솔 본체 OUT + 연동된 IO 박스의 OUT
  const linkedIoBoxes = useMemo(
    () => allDevices.filter(x => x.role === 'io_box' && x.ioBoxLinkedMixerId === device.id),
    [allDevices, device.id]
  );

  // [{ portId, label, source }]
  // portId 형식: "self:IN-1" or "ioboxId:IN-3"
  const inputPool = useMemo(() => {
    const list: Array<{ portId: string; label: string; sourceLabel: string; sourceColor: string }> = [];
    (device.inputs ?? []).forEach(p => {
      list.push({ portId: `self:${p}`, label: p, sourceLabel: '본체', sourceColor: '#888' });
    });
    linkedIoBoxes.forEach(box => {
      const kindLabel = box.ioBoxKind === 'stagebox' ? '📦 ' + box.name : '🃏 ' + box.name;
      const color = box.ioBoxKind === 'stagebox' ? '#22D3EE' : '#14B8A6';
      (box.inputs ?? []).forEach(p => {
        list.push({ portId: `${box.id}:${p}`, label: p, sourceLabel: kindLabel, sourceColor: color });
      });
    });
    return list;
  }, [device.inputs, linkedIoBoxes]);

  const outputPool = useMemo(() => {
    const list: Array<{ portId: string; label: string; sourceLabel: string; sourceColor: string }> = [];
    (device.outputs ?? []).forEach(p => {
      list.push({ portId: `self:${p}`, label: p, sourceLabel: '본체', sourceColor: '#888' });
    });
    linkedIoBoxes.forEach(box => {
      const kindLabel = box.ioBoxKind === 'stagebox' ? '📦 ' + box.name : '🃏 ' + box.name;
      const color = box.ioBoxKind === 'stagebox' ? '#22D3EE' : '#14B8A6';
      (box.outputs ?? []).forEach(p => {
        list.push({ portId: `${box.id}:${p}`, label: p, sourceLabel: kindLabel, sourceColor: color });
      });
    });
    return list;
  }, [device.outputs, linkedIoBoxes]);

  const inputs = device.inputs ?? [];   // (legacy 호환 — 본체 IN만)
  const outputs = device.outputs ?? []; // (legacy 호환 — 본체 OUT만)

  const handleSave = () => {
    onSave({
      audioChannels: channels,
      audioBuses: buses,
      audioPatch: patch,
      audioOutPatch: outPatch,
      mixMatrix: matrix,
    });
  };

  // ===== 채널 관리 =====
  const addChannel = (stereo = false) => {
    const id = `ch${Date.now().toString(36)}`;
    const idx = channels.length + 1;
    setChannels([...channels, {
      id,
      name: stereo ? `Stereo ${idx}` : `Ch ${idx}`,
      stereo,
      color: COLORS[channels.length % COLORS.length],
    }]);
  };
  const updateChannel = (id: string, upd: Partial<AudioChannel>) => {
    setChannels(channels.map(c => c.id === id ? { ...c, ...upd } : c));
  };
  const deleteChannel = (id: string) => {
    if (!confirm('이 채널을 삭제하면 관련 패치/매트릭스 설정도 사라집니다.')) return;
    setChannels(channels.filter(c => c.id !== id));
    // 패치에서 제거
    const newPatch = { ...patch };
    Object.keys(newPatch).forEach(p => { if (newPatch[p].channelId === id) delete newPatch[p]; });
    setPatch(newPatch);
    // 매트릭스에서 제거
    const newMatrix = { ...matrix };
    delete newMatrix[id];
    setMatrix(newMatrix);
  };

  // ===== 버스 관리 =====
  const addBus = (type: AudioBusType = 'aux', stereo = false) => {
    const id = `bus_${Date.now().toString(36)}`;
    const sameTypeBuses = buses.filter(b => b.type === type);
    const idx = sameTypeBuses.length + 1;
    setBuses([...buses, {
      id,
      name: `${AUDIO_BUS_TYPE_LABELS[type]} ${idx}`,
      type,
      stereo,
      color: COLORS[(buses.length + 3) % COLORS.length],
    }]);
  };
  const updateBus = (id: string, upd: Partial<AudioBus>) => {
    setBuses(buses.map(b => b.id === id ? { ...b, ...upd } : b));
  };
  const deleteBus = (id: string) => {
    if (!confirm('이 버스를 삭제하면 관련 매트릭스/출력 패치도 사라집니다.')) return;
    setBuses(buses.filter(b => b.id !== id));
    // 매트릭스에서 제거
    const newMatrix = { ...matrix };
    Object.keys(newMatrix).forEach(ch => {
      if (newMatrix[ch][id]) {
        const copy = { ...newMatrix[ch] };
        delete copy[id];
        newMatrix[ch] = copy;
      }
    });
    setMatrix(newMatrix);
    // 출력 패치에서 제거
    const newOut = { ...outPatch };
    Object.keys(newOut).forEach(p => { if (newOut[p].busId === id) delete newOut[p]; });
    setOutPatch(newOut);
  };

  // ===== 매트릭스 셀 업데이트 =====
  const updateCell = (chId: string, busId: string, upd: Partial<MixMatrixCell>) => {
    const current = matrix[chId]?.[busId] ?? { enabled: false, level: 0 };
    const newCell = { ...current, ...upd };
    setMatrix({
      ...matrix,
      [chId]: { ...(matrix[chId] ?? {}), [busId]: newCell },
    });
  };

  return (
    <div data-ui className="fixed inset-0 z-[60] bg-gradient-to-br from-neutral-950 via-black to-neutral-950 text-white flex flex-col">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3 shrink-0">
        <span className="text-2xl">🎛</span>
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold truncate">{device.name} <span className="text-neutral-500 font-normal text-sm">— 오디오 콘솔 설정</span></div>
          <div className="text-[11px] text-neutral-500 font-mono">
            물리 IN <span className="text-cyan-300">{inputPool.length}</span> ·
            채널 <span className="text-violet-300">{channels.length}</span> ·
            버스 <span className="text-amber-300">{buses.length}</span> ·
            물리 OUT <span className="text-emerald-300">{outputPool.length}</span>
            {linkedIoBoxes.length > 0 && (
              <span className="ml-2 text-cyan-200">
                · I/O 박스 <span className="text-white font-bold">{linkedIoBoxes.length}</span>대 연동
              </span>
            )}
          </div>
        </div>
        <button onClick={handleSave} className="px-4 py-2 text-[12px] font-bold rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/30">
          ✓ 저장
        </button>
        <button onClick={onClose} className="px-3 py-2 text-[12px] rounded-lg bg-white/5 hover:bg-white/10 border border-white/10">
          ✕ 닫기
        </button>
      </div>

      {/* 탭 */}
      <div className="px-4 pt-2 border-b border-white/10 flex items-end gap-1 shrink-0">
        {([
          { id: 'patch',    label: '🔌 입력 패치',    desc: '물리 IN → 채널' },
          { id: 'channels', label: '🎚 채널',          desc: '채널 정의' },
          { id: 'matrix',   label: '🎛 믹스 매트릭스', desc: '채널 × 버스' },
          { id: 'output',   label: '📤 출력 패치',    desc: '버스 → 물리 OUT' },
        ] as Array<{id: Tab, label: string, desc: string}>).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-[12px] font-medium border-b-2 ${
              tab === t.id
                ? 'border-cyan-400 text-white'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
            title={t.desc}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 컨텐츠 */}
      <div
        className="flex-1 overflow-y-auto custom-scroll p-4"
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          overscrollBehavior: 'contain',
          minHeight: 0,
        }}
      >
        {tab === 'patch' && (
          <PatchTab inputPool={inputPool} channels={channels} patch={patch} setPatch={setPatch} />
        )}
        {tab === 'channels' && (
          <ChannelsTab channels={channels} updateChannel={updateChannel} deleteChannel={deleteChannel} addChannel={addChannel} />
        )}
        {tab === 'matrix' && (
          <MatrixTab channels={channels} buses={buses} matrix={matrix} updateCell={updateCell} addBus={addBus} updateBus={updateBus} deleteBus={deleteBus} />
        )}
        {tab === 'output' && (
          <OutputTab outputPool={outputPool} buses={buses} outPatch={outPatch} setOutPatch={setOutPatch} />
        )}
      </div>
    </div>
  );
}

// =================================================================
// 입력 패치 탭
// =================================================================
function PatchTab({ inputPool, channels, patch, setPatch }: {
  inputPool: Array<{ portId: string; label: string; sourceLabel: string; sourceColor: string }>;
  channels: AudioChannel[];
  patch: Record<string, AudioPatchEntry>;
  setPatch: (p: Record<string, AudioPatchEntry>) => void;
}) {
  return (
    <div className="max-w-3xl">
      <div className="mb-3 text-[11px] text-neutral-400 bg-cyan-500/5 border border-cyan-500/15 rounded p-2.5">
        💡 <strong>물리 IN 단자</strong>가 콘솔 내부의 <strong>어떤 채널</strong>로 들어갈지 매핑합니다. 본체 IN과 연동된 스테이지박스/옵션카드 IN이 모두 표시됩니다.
      </div>
      <div className="space-y-1">
        <div className="grid grid-cols-[170px_120px_1fr_120px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-500 font-semibold border-b border-white/10">
          <div>출처</div>
          <div>물리 IN</div>
          <div>→ 채널</div>
          <div>L/R</div>
        </div>
        {inputPool.length === 0 && (
          <div className="text-[12px] text-neutral-500 italic p-4 text-center">
            장비 설정에서 물리 IN 포트를 먼저 추가하거나, I/O 박스를 연동하세요.
          </div>
        )}
        {inputPool.map(p => {
          const entry = patch[p.portId];
          const ch = entry ? channels.find(c => c.id === entry.channelId) : null;
          return (
            <div key={p.portId} className="grid grid-cols-[170px_120px_1fr_120px] gap-2 items-center px-3 py-2 hover:bg-white/[0.02] rounded">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-1 h-4 rounded shrink-0" style={{ background: p.sourceColor }}></div>
                <span className="text-[10.5px] truncate" style={{ color: p.sourceColor }}>{p.sourceLabel}</span>
              </div>
              <div className="text-[12px] font-mono text-cyan-300 font-bold">{p.label}</div>
              <select
                value={entry?.channelId ?? ''}
                onChange={e => {
                  if (!e.target.value) {
                    const np = { ...patch };
                    delete np[p.portId];
                    setPatch(np);
                  } else {
                    setPatch({ ...patch, [p.portId]: { channelId: e.target.value, side: entry?.side ?? 'mono' } });
                  }
                }}
                className="bg-neutral-900 border border-white/15 rounded px-2 py-1.5 text-[11.5px] focus:border-cyan-400 focus:outline-none"
              >
                <option value="">(연결 없음)</option>
                {channels.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.stereo ? '(스테레오)' : '(모노)'}
                  </option>
                ))}
              </select>
              <select
                value={entry?.side ?? 'mono'}
                disabled={!entry || !ch?.stereo}
                onChange={e => {
                  if (!entry) return;
                  setPatch({ ...patch, [p.portId]: { ...entry, side: e.target.value as any } });
                }}
                className="bg-neutral-900 border border-white/15 rounded px-2 py-1.5 text-[11px] disabled:opacity-30"
              >
                {ch?.stereo ? (
                  <>
                    <option value="L">L (왼쪽)</option>
                    <option value="R">R (오른쪽)</option>
                  </>
                ) : (
                  <option value="mono">모노</option>
                )}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =================================================================
// 채널 정의 탭
// =================================================================
function ChannelsTab({ channels, updateChannel, deleteChannel, addChannel }: {
  channels: AudioChannel[];
  updateChannel: (id: string, upd: Partial<AudioChannel>) => void;
  deleteChannel: (id: string) => void;
  addChannel: (stereo?: boolean) => void;
}) {
  return (
    <div className="max-w-3xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] text-neutral-400 bg-violet-500/5 border border-violet-500/15 rounded p-2.5 flex-1 mr-2">
          💡 콘솔의 <strong>채널 스트립</strong>을 정의합니다. 모노 채널은 1개 입력, 스테레오 채널은 L/R 페어.
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button onClick={() => addChannel(false)} className="px-3 py-2 text-[11px] font-medium rounded-lg bg-violet-500/20 hover:bg-violet-500/40 border border-violet-500/40 text-violet-200">＋ 모노</button>
          <button onClick={() => addChannel(true)} className="px-3 py-2 text-[11px] font-medium rounded-lg bg-pink-500/20 hover:bg-pink-500/40 border border-pink-500/40 text-pink-200">＋ 스테레오</button>
        </div>
      </div>
      <div className="space-y-1">
        {channels.length === 0 && (
          <div className="text-[12px] text-neutral-500 italic p-6 text-center">
            아직 채널이 없습니다. 위에서 추가해 주세요.
          </div>
        )}
        {channels.map((ch, i) => (
          <div key={ch.id} className="flex items-center gap-2 p-2 bg-white/[0.02] rounded border border-white/5 hover:border-white/15">
            <div className="text-[10px] font-mono text-neutral-500 w-8 text-center">#{(i + 1).toString().padStart(2, '0')}</div>
            <input
              type="color"
              value={ch.color ?? '#06B6D4'}
              onChange={e => updateChannel(ch.id, { color: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
            />
            <input
              type="text"
              value={ch.name}
              onChange={e => updateChannel(ch.id, { name: e.target.value })}
              className="flex-1 bg-neutral-900 border border-white/15 rounded px-2 py-1.5 text-[12px]"
              placeholder="채널 이름"
            />
            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer px-2">
              <input
                type="checkbox"
                checked={ch.stereo}
                onChange={e => updateChannel(ch.id, { stereo: e.target.checked })}
                className="accent-pink-500"
              />
              <span className={ch.stereo ? 'text-pink-300' : 'text-neutral-500'}>스테레오</span>
            </label>
            <button onClick={() => deleteChannel(ch.id)}
              className="px-2 py-1.5 text-[11px] rounded bg-rose-500/10 hover:bg-rose-500 border border-rose-500/30 text-rose-300 hover:text-white">삭제</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// =================================================================
// 믹스 매트릭스 탭 — 핵심
// =================================================================
function MatrixTab({ channels, buses, matrix, updateCell, addBus, updateBus, deleteBus }: {
  channels: AudioChannel[];
  buses: AudioBus[];
  matrix: Record<string, Record<string, MixMatrixCell>>;
  updateCell: (chId: string, busId: string, upd: Partial<MixMatrixCell>) => void;
  addBus: (type?: AudioBusType, stereo?: boolean) => void;
  updateBus: (id: string, upd: Partial<AudioBus>) => void;
  deleteBus: (id: string) => void;
}) {
  const [selectedBus, setSelectedBus] = useState<string | null>(buses[0]?.id ?? null);

  if (channels.length === 0) {
    return <div className="text-[12px] text-neutral-500 italic p-6 text-center">먼저 채널을 추가하세요.</div>;
  }

  return (
    <div className="space-y-3">
      {/* 버스 관리 */}
      <div className="bg-white/[0.02] border border-white/10 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-bold text-neutral-300">버스 (출력 믹스)</div>
          <div className="flex gap-1">
            <button onClick={() => addBus('aux', false)} className="px-2 py-1 text-[10.5px] rounded bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200">＋ AUX</button>
            <button onClick={() => addBus('aux', true)} className="px-2 py-1 text-[10.5px] rounded bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200">＋ AUX (스테레오)</button>
            <button onClick={() => addBus('group', true)} className="px-2 py-1 text-[10.5px] rounded bg-blue-500/15 hover:bg-blue-500/30 border border-blue-500/30 text-blue-200">＋ GROUP</button>
            <button onClick={() => addBus('matrix', true)} className="px-2 py-1 text-[10.5px] rounded bg-purple-500/15 hover:bg-purple-500/30 border border-purple-500/30 text-purple-200">＋ MATRIX</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {buses.map(b => (
            <button
              key={b.id}
              onClick={() => setSelectedBus(b.id)}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-lg border flex items-center gap-1.5 ${
                selectedBus === b.id
                  ? 'bg-white/10 border-white/30 text-white shadow-md'
                  : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white hover:bg-white/10'
              }`}
              style={{ borderLeftColor: b.color, borderLeftWidth: 3 }}
            >
              <span className="text-[9px] font-mono opacity-70">{AUDIO_BUS_TYPE_LABELS[b.type]}</span>
              <span>{b.name}</span>
              {b.stereo && <span className="text-[8.5px] px-1 rounded bg-pink-500/20 text-pink-300">ST</span>}
            </button>
          ))}
        </div>
      </div>

      {/* 선택된 버스의 채널 매트릭스 */}
      {selectedBus && (() => {
        const bus = buses.find(b => b.id === selectedBus);
        if (!bus) return null;
        return (
          <div className="bg-gradient-to-br from-cyan-500/5 to-transparent border border-cyan-500/20 rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-6 rounded-full" style={{ background: bus.color }}></div>
                <div>
                  <div className="text-[13px] font-bold">{bus.name}</div>
                  <div className="text-[10px] text-neutral-500">
                    {AUDIO_BUS_TYPE_LABELS[bus.type]} · {bus.stereo ? '스테레오' : '모노'} · 이 버스로 보낼 채널 비율 설정
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={bus.name}
                  onChange={e => updateBus(bus.id, { name: e.target.value })}
                  className="w-32 bg-neutral-900 border border-white/15 rounded px-2 py-1 text-[11px]"
                />
                <input
                  type="color"
                  value={bus.color ?? '#10B981'}
                  onChange={e => updateBus(bus.id, { color: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                />
                <label className="text-[10px] flex items-center gap-1 px-1.5">
                  <input type="checkbox" checked={bus.stereo} onChange={e => updateBus(bus.id, { stereo: e.target.checked })} className="accent-pink-500" />
                  <span>ST</span>
                </label>
                <button onClick={() => deleteBus(bus.id)} className="px-2 py-1 text-[10px] rounded bg-rose-500/15 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/30">삭제</button>
              </div>
            </div>

            {/* 채널 send 목록 */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-[28px_140px_1fr_70px_60px_70px] gap-2 px-2 py-1 text-[9.5px] uppercase tracking-wider text-neutral-500 font-semibold">
                <div>ON</div>
                <div>채널</div>
                <div>SEND LEVEL (dB)</div>
                <div className="text-right">dB</div>
                <div className="text-center">{bus.stereo ? 'PAN' : ''}</div>
                <div className="text-right">{bus.type === 'aux' ? 'PRE/POST' : ''}</div>
              </div>
              {channels.map(ch => {
                const cell: MixMatrixCell = matrix[ch.id]?.[bus.id] ?? { enabled: false, level: 0, pan: 0, prePost: 'post' };
                return (
                  <div key={ch.id} className={`grid grid-cols-[28px_140px_1fr_70px_60px_70px] gap-2 items-center px-2 py-1.5 rounded transition ${
                    cell.enabled ? 'bg-white/[0.04]' : 'bg-transparent opacity-50 hover:opacity-100'
                  }`}>
                    <input
                      type="checkbox"
                      checked={cell.enabled}
                      onChange={e => updateCell(ch.id, bus.id, { enabled: e.target.checked })}
                      className="w-4 h-4 cursor-pointer"
                      style={{ accentColor: bus.color }}
                    />
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2 h-5 rounded shrink-0" style={{ background: ch.color ?? '#888' }}></div>
                      <div className="text-[11px] truncate">{ch.name}</div>
                      {ch.stereo && <span className="text-[8.5px] text-pink-400 shrink-0">ST</span>}
                    </div>
                    <input
                      type="range"
                      min={MIN_DB}
                      max={MAX_DB}
                      step={0.5}
                      value={cell.level}
                      disabled={!cell.enabled}
                      onChange={e => updateCell(ch.id, bus.id, { level: parseFloat(e.target.value) })}
                      className="w-full"
                      style={{ accentColor: bus.color }}
                    />
                    <input
                      type="number"
                      step={0.5}
                      value={cell.level}
                      disabled={!cell.enabled}
                      onChange={e => updateCell(ch.id, bus.id, { level: parseFloat(e.target.value) || 0 })}
                      className="bg-neutral-900 border border-white/10 rounded px-1.5 py-1 text-[10.5px] text-right font-mono disabled:opacity-30"
                    />
                    {bus.stereo ? (
                      <input
                        type="range"
                        min={-100}
                        max={100}
                        step={5}
                        value={cell.pan ?? 0}
                        disabled={!cell.enabled || ch.stereo}
                        onChange={e => updateCell(ch.id, bus.id, { pan: parseInt(e.target.value) })}
                        className="w-full"
                        title={ch.stereo ? '스테레오 채널은 PAN 없음' : `Pan: ${cell.pan ?? 0}`}
                      />
                    ) : <div></div>}
                    {bus.type === 'aux' ? (
                      <select
                        value={cell.prePost ?? 'post'}
                        disabled={!cell.enabled}
                        onChange={e => updateCell(ch.id, bus.id, { prePost: e.target.value as 'pre' | 'post' })}
                        className="bg-neutral-900 border border-white/10 rounded px-1.5 py-1 text-[10px] disabled:opacity-30"
                      >
                        <option value="post">POST</option>
                        <option value="pre">PRE</option>
                      </select>
                    ) : <div></div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// =================================================================
// 출력 패치 탭
// =================================================================
function OutputTab({ outputPool, buses, outPatch, setOutPatch }: {
  outputPool: Array<{ portId: string; label: string; sourceLabel: string; sourceColor: string }>;
  buses: AudioBus[];
  outPatch: Record<string, AudioOutPatchEntry>;
  setOutPatch: (p: Record<string, AudioOutPatchEntry>) => void;
}) {
  return (
    <div className="max-w-3xl">
      <div className="mb-3 text-[11px] text-neutral-400 bg-emerald-500/5 border border-emerald-500/15 rounded p-2.5">
        💡 <strong>버스</strong>가 어떤 <strong>물리 OUT 단자</strong>로 나갈지 매핑합니다. 본체와 연동된 I/O 박스 OUT이 모두 표시됩니다.
      </div>
      <div className="space-y-1">
        <div className="grid grid-cols-[170px_120px_1fr_120px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-500 font-semibold border-b border-white/10">
          <div>출처</div>
          <div>물리 OUT</div>
          <div>← 버스</div>
          <div>L/R</div>
        </div>
        {outputPool.length === 0 && (
          <div className="text-[12px] text-neutral-500 italic p-4 text-center">
            장비 설정에서 물리 OUT 포트를 먼저 추가하거나, I/O 박스를 연동하세요.
          </div>
        )}
        {outputPool.map(p => {
          const entry = outPatch[p.portId];
          const bus = entry ? buses.find(b => b.id === entry.busId) : null;
          return (
            <div key={p.portId} className="grid grid-cols-[170px_120px_1fr_120px] gap-2 items-center px-3 py-2 hover:bg-white/[0.02] rounded">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-1 h-4 rounded shrink-0" style={{ background: p.sourceColor }}></div>
                <span className="text-[10.5px] truncate" style={{ color: p.sourceColor }}>{p.sourceLabel}</span>
              </div>
              <div className="text-[12px] font-mono text-emerald-300 font-bold">{p.label}</div>
              <select
                value={entry?.busId ?? ''}
                onChange={e => {
                  if (!e.target.value) {
                    const np = { ...outPatch };
                    delete np[p.portId];
                    setOutPatch(np);
                  } else {
                    setOutPatch({ ...outPatch, [p.portId]: { busId: e.target.value, side: entry?.side ?? 'mono' } });
                  }
                }}
                className="bg-neutral-900 border border-white/15 rounded px-2 py-1.5 text-[11.5px] focus:border-emerald-400 focus:outline-none"
              >
                <option value="">(연결 없음)</option>
                {buses.map(b => (
                  <option key={b.id} value={b.id}>
                    [{AUDIO_BUS_TYPE_LABELS[b.type]}] {b.name} {b.stereo ? '(스테레오)' : '(모노)'}
                  </option>
                ))}
              </select>
              <select
                value={entry?.side ?? 'mono'}
                disabled={!entry || !bus?.stereo}
                onChange={e => {
                  if (!entry) return;
                  setOutPatch({ ...outPatch, [p.portId]: { ...entry, side: e.target.value as any } });
                }}
                className="bg-neutral-900 border border-white/15 rounded px-2 py-1.5 text-[11px] disabled:opacity-30"
              >
                {bus?.stereo ? (
                  <>
                    <option value="L">L (왼쪽)</option>
                    <option value="R">R (오른쪽)</option>
                  </>
                ) : (
                  <option value="mono">모노</option>
                )}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
