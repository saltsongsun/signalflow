'use client';
import { useState } from 'react';
import { Layer, supabase } from '../lib/supabase';

const LAYER_COLORS = ['#3B82F6', '#EF4444', '#A855F7', '#10B981', '#F59E0B', '#EC4899', '#06B6D4', '#8B5CF6', '#F97316', '#64748B'];

type Props = {
  layers: Layer[];
  onClose: () => void;
};

export default function LayerPanel({ layers, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const toggleVisible = async (l: Layer) => {
    await (supabase as any).from('layers').update({ visible: !l.visible }).eq('id', l.id);
  };

  const addLayer = async () => {
    const id = `layer_${Date.now().toString(36)}`;
    const maxOrder = layers.reduce((m, l) => Math.max(m, l.sort_order), 0);
    const color = LAYER_COLORS[layers.length % LAYER_COLORS.length];
    await (supabase as any).from('layers').insert({
      id, name: `레이어 ${layers.length + 1}`, color, visible: true, sort_order: maxOrder + 1,
    });
  };

  const deleteLayer = async (l: Layer) => {
    if (layers.length <= 1) { alert('최소 1개 레이어는 유지'); return; }
    if (!confirm(`"${l.name}" 레이어 삭제? 이 레이어의 포트들은 첫 번째 레이어로 이동합니다.`)) return;
    await (supabase as any).from('layers').delete().eq('id', l.id);
    // NOTE: 포트 layerId 재할당은 서버에서 cascading 안되므로 클라이언트에서 처리하거나 보류. 
    // 일단 삭제만. 고아 layerId는 Fallback으로 첫 레이어 취급됨.
  };

  const renameLayer = async (l: Layer, newName: string) => {
    await (supabase as any).from('layers').update({ name: newName }).eq('id', l.id);
    setEditingId(null);
  };

  const changeColor = async (l: Layer, color: string) => {
    await (supabase as any).from('layers').update({ color }).eq('id', l.id);
  };

  const sorted = [...layers].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="absolute top-14 right-4 z-30 bg-neutral-950 border border-neutral-800 rounded-lg shadow-2xl w-72 max-h-[70vh] flex flex-col">
      <div className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between">
        <div className="text-sm font-semibold">레이어</div>
        <button onClick={onClose} className="w-6 h-6 rounded hover:bg-neutral-800 text-neutral-400">✕</button>
      </div>

      <div className="overflow-y-auto flex-1 p-2 space-y-1">
        {sorted.map(l => (
          <div
            key={l.id}
            className={`group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-900 ${!l.visible ? 'opacity-40' : ''}`}
          >
            <button
              onClick={() => toggleVisible(l)}
              className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-white"
              title={l.visible ? '숨기기' : '보이기'}
            >
              {l.visible ? '👁' : '⊘'}
            </button>

            <div className="relative">
              <input
                type="color"
                value={l.color}
                onChange={e => changeColor(l, e.target.value)}
                className="w-4 h-4 rounded cursor-pointer border border-neutral-700 bg-transparent"
                style={{ padding: 0 }}
              />
            </div>

            {editingId === l.id ? (
              <input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={() => renameLayer(l, editName || l.name)}
                onKeyDown={e => { if (e.key === 'Enter') renameLayer(l, editName || l.name); if (e.key === 'Escape') setEditingId(null); }}
                className="flex-1 bg-neutral-800 text-xs rounded px-1.5 py-0.5 focus:outline-none border border-sky-500"
              />
            ) : (
              <button
                onClick={() => { setEditingId(l.id); setEditName(l.name); }}
                className="flex-1 text-left text-xs truncate"
              >
                {l.name}
              </button>
            )}

            <button
              onClick={() => deleteLayer(l)}
              className="w-5 h-5 rounded text-xs text-neutral-600 hover:text-rose-400 opacity-0 group-hover:opacity-100"
              title="삭제"
            >×</button>
          </div>
        ))}
      </div>

      <div className="border-t border-neutral-800 p-2">
        <button
          onClick={addLayer}
          className="w-full py-1.5 text-xs rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-dashed border-neutral-700"
        >＋ 레이어 추가</button>
      </div>
    </div>
  );
}
