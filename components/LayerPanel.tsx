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
    if (!confirm(`"${l.name}" 레이어 삭제?`)) return;
    await (supabase as any).from('layers').delete().eq('id', l.id);
  };
  const renameLayer = async (l: Layer, newName: string) => {
    await (supabase as any).from('layers').update({ name: newName }).eq('id', l.id);
    setEditingId(null);
  };
  const changeColor = async (l: Layer, color: string) => {
    await (supabase as any).from('layers').update({ color }).eq('id', l.id);
  };

  const sorted = [...layers].sort((a, b) => a.sort_order - b.sort_order);
  const visibleCount = layers.filter(l => l.visible).length;
  const allVisible = visibleCount === layers.length;
  const toggleAll = async () => {
    await Promise.all(layers.map(l => (supabase as any).from('layers').update({ visible: !allVisible }).eq('id', l.id)));
  };

  return (
    <div
      data-ui
      className="fixed top-[72px] left-4 z-40 w-72 bg-gradient-to-b from-neutral-900/95 to-neutral-950/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden"
      style={{ maxHeight: 'calc(100vh - 100px)' }}
    >
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-purple-500/10 to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-gradient-to-b from-purple-400 to-purple-600"></div>
          <div>
            <div className="text-sm font-semibold text-white">레이어</div>
            <div className="text-[10px] text-neutral-500">{visibleCount} / {layers.length} 표시중</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleAll}
            className="text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition"
          >{allVisible ? '모두 숨김' : '모두 표시'}</button>
          <button onClick={onClose} className="w-6 h-6 rounded hover:bg-white/10 text-neutral-500 hover:text-white">✕</button>
        </div>
      </div>

      <div className="overflow-y-auto p-2 space-y-1 custom-scroll" style={{ maxHeight: 'calc(100vh - 210px)' }}>
        {sorted.map(l => (
          <div
            key={l.id}
            className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-all ${l.visible ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-white/5 bg-transparent opacity-50 hover:opacity-80'}`}
          >
            <button
              onClick={() => toggleVisible(l)}
              className="w-6 h-6 flex items-center justify-center text-sm hover:bg-white/10 rounded transition"
              title={l.visible ? '숨기기' : '보이기'}
            >
              {l.visible ? '👁' : <span className="text-neutral-600">⊘</span>}
            </button>

            <label className="relative cursor-pointer">
              <div
                className="w-4 h-4 rounded-md ring-1 ring-white/20 shadow-inner"
                style={{ background: l.color }}
              />
              <input
                type="color"
                value={l.color}
                onChange={e => changeColor(l, e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>

            {editingId === l.id ? (
              <input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={() => renameLayer(l, editName || l.name)}
                onKeyDown={e => { if (e.key === 'Enter') renameLayer(l, editName || l.name); if (e.key === 'Escape') setEditingId(null); }}
                className="flex-1 bg-neutral-800 text-xs rounded px-2 py-1 focus:outline-none border border-sky-500 text-white"
              />
            ) : (
              <button
                onClick={() => { setEditingId(l.id); setEditName(l.name); }}
                className="flex-1 text-left text-xs text-neutral-200 truncate"
              >
                {l.name}
              </button>
            )}

            <button
              onClick={() => deleteLayer(l)}
              className="w-6 h-6 rounded text-sm text-neutral-600 hover:text-rose-400 hover:bg-rose-400/10 opacity-0 group-hover:opacity-100 transition"
              title="삭제"
            >×</button>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 p-2 bg-gradient-to-t from-purple-500/5 to-transparent">
        <button
          onClick={addLayer}
          className="w-full py-2 text-xs rounded-lg bg-gradient-to-r from-purple-500/20 to-purple-600/20 hover:from-purple-500/30 hover:to-purple-600/30 text-purple-300 hover:text-purple-200 border border-purple-500/30 transition"
        >＋ 새 레이어</button>
      </div>
    </div>
  );
}
