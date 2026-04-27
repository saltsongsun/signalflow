'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Project, ProjectCategory, PROJECT_CATEGORY_LABELS, PROJECT_CATEGORY_COLORS } from '@/lib/supabase';
import { PROJECT_TEMPLATES, getTemplateById } from '@/lib/projectTemplates';

export default function ProjectListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState<ProjectCategory | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from('projects').select('*').order('updated_at', { ascending: false });
      setProjects((data ?? []) as Project[]);
      setLoading(false);
    })();
  }, []);

  const filtered = projects.filter(p => {
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    if (search && !(`${p.name} ${p.description ?? ''}`.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  const openProject = (id: string, p: Project) => {
    if (p.passcode) {
      const entered = prompt('이 프로젝트는 비밀번호가 있습니다. 입력하세요:');
      if (entered !== p.passcode) {
        alert('비밀번호가 틀렸습니다.');
        return;
      }
    }
    router.push(`/p/${id}`);
  };

  const deleteProject = async (id: string, name: string) => {
    if (!confirm(`프로젝트 "${name}"을(를) 삭제하시겠습니까?\n관련된 모든 장비/연결/레이어가 삭제됩니다.`)) return;
    await (supabase as any).from('connections').delete().eq('project_id', id);
    await (supabase as any).from('devices').delete().eq('project_id', id);
    await (supabase as any).from('layers').delete().eq('project_id', id);
    await (supabase as any).from('racks').delete().eq('project_id', id);
    await (supabase as any).from('projects').delete().eq('id', id);
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  const renameProject = async (id: string, currentName: string) => {
    const next = prompt('새 이름:', currentName);
    if (!next || next === currentName) return;
    await (supabase as any).from('projects').update({ name: next, updated_at: new Date().toISOString() }).eq('id', id);
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name: next } : p));
  };

  const duplicateProject = async (src: Project) => {
    const newName = prompt('복제 후 이름:', `${src.name} (복사본)`);
    if (!newName) return;
    const newId = `proj_${Date.now().toString(36)}`;
    await (supabase as any).from('projects').insert({
      ...src,
      id: newId,
      name: newName,
      created_at: undefined,
      updated_at: undefined,
    });
    const idMap = new Map<string, string>();
    const { data: srcDevices } = await (supabase as any).from('devices').select('*').eq('project_id', src.id);
    if (srcDevices && srcDevices.length > 0) {
      const newDevices = (srcDevices as any[]).map(d => {
        const newDevId = `${d.id}_${Date.now().toString(36).slice(-3)}`;
        idMap.set(d.id, newDevId);
        return { ...d, id: newDevId, project_id: newId, created_at: undefined };
      });
      newDevices.forEach(d => {
        if (d.multiviewLinkedSwitcherId && idMap.has(d.multiviewLinkedSwitcherId)) {
          d.multiviewLinkedSwitcherId = idMap.get(d.multiviewLinkedSwitcherId);
        }
        if (d.ioBoxLinkedMixerId && idMap.has(d.ioBoxLinkedMixerId)) {
          d.ioBoxLinkedMixerId = idMap.get(d.ioBoxLinkedMixerId);
        }
      });
      await (supabase as any).from('devices').insert(newDevices);
    }
    const { data: srcConns } = await (supabase as any).from('connections').select('*').eq('project_id', src.id);
    if (srcConns && srcConns.length > 0) {
      const newConns = (srcConns as any[]).map(c => ({
        ...c,
        id: crypto.randomUUID(),
        from_device: idMap.get(c.from_device) ?? c.from_device,
        to_device: idMap.get(c.to_device) ?? c.to_device,
        project_id: newId,
        created_at: undefined,
      }));
      await (supabase as any).from('connections').insert(newConns);
    }
    const { data: srcLayers } = await (supabase as any).from('layers').select('*').eq('project_id', src.id);
    if (srcLayers && srcLayers.length > 0) {
      const newLayers = (srcLayers as any[]).map(l => ({
        ...l, id: `${l.id}_${newId}`, project_id: newId, created_at: undefined,
      }));
      await (supabase as any).from('layers').insert(newLayers);
    }
    const { data: refreshed } = await (supabase as any).from('projects').select('*').order('updated_at', { ascending: false });
    setProjects((refreshed ?? []) as Project[]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-black to-neutral-950 text-white">
      <header className="border-b border-white/10 bg-black/40 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-sky-400 to-purple-600 flex items-center justify-center shadow-lg shadow-sky-500/30">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <circle cx="3" cy="3" r="1.5" fill="white"/>
              <circle cx="13" cy="3" r="1.5" fill="white"/>
              <circle cx="3" cy="13" r="1.5" fill="white"/>
              <circle cx="13" cy="13" r="1.5" fill="white"/>
              <path d="M3 3 L13 13 M13 3 L3 13" stroke="white" strokeWidth="0.8" opacity="0.6"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold">Signal Flow Map</div>
            <div className="text-[11px] text-neutral-500">신호 흐름 도면 도구</div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 text-[12px] font-bold rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/30"
          >＋ 새 프로젝트</button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 pt-4 pb-2 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[12px] focus:border-sky-400 focus:outline-none w-48"
        />
        <button
          onClick={() => setFilterCategory('all')}
          className={`px-3 py-1.5 text-[11px] rounded-lg border ${
            filterCategory === 'all' ? 'bg-white/10 border-white/30 text-white' : 'bg-white/[0.02] border-white/10 text-neutral-400 hover:text-white'
          }`}
        >전체 <span className="font-mono opacity-60">{projects.length}</span></button>
        {(Object.keys(PROJECT_CATEGORY_LABELS) as ProjectCategory[]).map(cat => {
          const count = projects.filter(p => p.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 text-[11px] rounded-lg border flex items-center gap-1.5 ${
                filterCategory === cat ? 'border-white/30 text-white' : 'border-white/10 text-neutral-400 hover:text-white'
              }`}
              style={{
                background: filterCategory === cat ? `${PROJECT_CATEGORY_COLORS[cat]}30` : 'rgba(255,255,255,0.02)',
              }}
            >
              <div className="w-2 h-2 rounded-full" style={{ background: PROJECT_CATEGORY_COLORS[cat] }}></div>
              {PROJECT_CATEGORY_LABELS[cat]} <span className="font-mono opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      <main className="max-w-7xl mx-auto px-4 py-4">
        {loading ? (
          <div className="text-center py-20 text-neutral-500">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-3 opacity-50">📁</div>
            <div className="text-neutral-400 mb-4">
              {projects.length === 0 ? '아직 프로젝트가 없습니다.' : '검색 결과가 없습니다.'}
            </div>
            {projects.length === 0 && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-5 py-2 text-[13px] font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30"
              >＋ 첫 프로젝트 만들기</button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={() => openProject(p.id, p)}
                onRename={() => renameProject(p.id, p.name)}
                onDelete={() => deleteProject(p.id, p.name)}
                onDuplicate={() => duplicateProject(p)}
              />
            ))}
          </div>
        )}
      </main>

      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => {
            setShowCreateModal(false);
            router.push(`/p/${id}`);
          }}
        />
      )}
    </div>
  );
}

function ProjectCard({ project, onOpen, onRename, onDelete, onDuplicate }: {
  project: Project;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const color = project.thumbnail_color ?? PROJECT_CATEGORY_COLORS[project.category] ?? '#3B82F6';
  return (
    <div
      className="group relative bg-gradient-to-br from-white/[0.04] to-transparent border border-white/10 rounded-xl overflow-hidden hover:border-white/30 transition cursor-pointer"
      onClick={onOpen}
    >
      <div
        className="h-28 flex items-center justify-center relative"
        style={{ background: `linear-gradient(135deg, ${color}40 0%, ${color}10 100%)` }}
      >
        <div className="text-5xl opacity-90">{project.icon ?? '📡'}</div>
        {project.passcode && (
          <div className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/80 text-black font-mono font-bold">🔒 잠김</div>
        )}
      </div>
      <div className="p-3">
        <div className="text-[14px] font-bold truncate mb-0.5">{project.name}</div>
        {project.description && (
          <div className="text-[10.5px] text-neutral-500 truncate mb-2">{project.description}</div>
        )}
        <div className="flex items-center gap-1.5 text-[9.5px] font-mono">
          <span className="px-1.5 py-0.5 rounded" style={{ background: `${color}20`, color }}>
            {PROJECT_CATEGORY_LABELS[project.category]}
          </span>
          {project.updated_at && (
            <span className="text-neutral-600 ml-auto">
              {new Date(project.updated_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      <div className="absolute top-1.5 left-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={(e) => { e.stopPropagation(); onRename(); }}
          className="text-[10px] px-1.5 py-0.5 rounded bg-black/60 hover:bg-white/20"
          title="이름 변경"
        >✎</button>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="text-[10px] px-1.5 py-0.5 rounded bg-black/60 hover:bg-white/20"
          title="복제"
        >⎘</button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-[10px] px-1.5 py-0.5 rounded bg-black/60 hover:bg-rose-500"
          title="삭제"
        >🗑</button>
      </div>
    </div>
  );
}

function CreateProjectModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [step, setStep] = useState<'template' | 'detail'>('template');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('blank');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [passcode, setPasscode] = useState('');
  const [creating, setCreating] = useState(false);

  const tpl = getTemplateById(selectedTemplateId);

  const handleCreate = async () => {
    if (!name.trim()) {
      alert('프로젝트 이름을 입력하세요.');
      return;
    }
    setCreating(true);
    try {
      const id = `proj_${Date.now().toString(36)}`;
      await (supabase as any).from('projects').insert({
        id,
        name: name.trim(),
        description: description.trim() || null,
        category: tpl.category,
        template_id: tpl.id,
        passcode: passcode.trim() || null,
        thumbnail_color: tpl.color,
        icon: tpl.icon,
        terminology: tpl.terminology,
        enabled_roles: tpl.enabledRoles,
      });
      const layers = tpl.layers.map((l, i) => ({
        ...l,
        id: `layer_${id}_${i}`,
        project_id: id,
      }));
      if (layers.length > 0) {
        await (supabase as any).from('layers').insert(layers);
      }
      if (tpl.starterDevices && tpl.starterDevices.length > 0) {
        const devs = tpl.starterDevices.map((d, i) => ({
          ...d,
          id: `dev_${id}_${i}`,
          project_id: id,
        }));
        await (supabase as any).from('devices').insert(devs);
      }
      onCreated(id);
    } catch (err) {
      console.error(err);
      alert('프로젝트 생성 실패: ' + (err as any)?.message);
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[90vh] bg-gradient-to-b from-neutral-900 to-neutral-950 border border-white/15 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10 flex items-center gap-3">
          <div className="text-2xl">{step === 'template' ? '🎨' : '✏️'}</div>
          <div className="flex-1">
            <div className="text-[13px] font-bold">새 프로젝트 만들기</div>
            <div className="text-[10.5px] text-neutral-500">
              {step === 'template' ? '1단계: 템플릿 선택' : '2단계: 프로젝트 정보 입력'}
            </div>
          </div>
          <button onClick={onClose} className="px-2 py-1 text-[11px] rounded bg-white/5 hover:bg-white/10 border border-white/10">✕ 취소</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 'template' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PROJECT_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplateId(t.id)}
                  className={`text-left rounded-lg border p-3 transition ${
                    selectedTemplateId === t.id
                      ? 'border-white/40 shadow-lg'
                      : 'border-white/10 hover:border-white/25'
                  }`}
                  style={{
                    background: selectedTemplateId === t.id ? `${t.color}25` : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="text-2xl">{t.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold truncate">{t.name}</div>
                      <div className="text-[9.5px]" style={{ color: t.color }}>
                        {PROJECT_CATEGORY_LABELS[t.category]}
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-neutral-400 leading-relaxed">{t.description}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.enabledRoles.slice(0, 6).map(r => (
                      <span key={r} className="text-[8.5px] px-1.5 py-[1px] rounded bg-white/5 border border-white/10 text-neutral-400 font-mono">{r}</span>
                    ))}
                    {t.enabledRoles.length > 6 && (
                      <span className="text-[8.5px] px-1.5 py-[1px] rounded text-neutral-600">+{t.enabledRoles.length - 6}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="max-w-xl space-y-4">
              <div>
                <label className="text-[10.5px] uppercase tracking-wider text-neutral-500 font-semibold block mb-1">프로젝트 이름 *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="예: 본사 회의실 AV, 음악실 음향 시스템..."
                  autoFocus
                  className="w-full bg-neutral-950 border border-white/15 rounded px-3 py-2 text-[13px] focus:border-emerald-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10.5px] uppercase tracking-wider text-neutral-500 font-semibold block mb-1">설명 (선택)</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="이 프로젝트에 대한 간단한 설명..."
                  rows={2}
                  className="w-full bg-neutral-950 border border-white/15 rounded px-3 py-2 text-[12px] focus:border-emerald-400 focus:outline-none resize-none"
                />
              </div>
              <div>
                <label className="text-[10.5px] uppercase tracking-wider text-neutral-500 font-semibold block mb-1">접근 비밀번호 (선택)</label>
                <input
                  type="text"
                  value={passcode}
                  onChange={e => setPasscode(e.target.value)}
                  placeholder="예: 1234 — 비워두면 누구나 열람 가능"
                  maxLength={20}
                  className="w-full bg-neutral-950 border border-white/15 rounded px-3 py-2 text-[12px] focus:border-emerald-400 focus:outline-none font-mono"
                />
                <div className="text-[10px] text-neutral-500 mt-1">
                  ⚠️ 강력한 보안이 아닌 단순 잠금 — URL 공유받은 사람이 비밀번호 입력 후 접근.
                </div>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded p-3">
                <div className="text-[10.5px] uppercase tracking-wider text-neutral-500 font-semibold mb-2">선택한 템플릿</div>
                <div className="flex items-center gap-2">
                  <div className="text-2xl">{tpl.icon}</div>
                  <div>
                    <div className="text-[12px] font-bold">{tpl.name}</div>
                    <div className="text-[10px] text-neutral-500">{tpl.description}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between gap-2">
          {step === 'template' ? (
            <>
              <button onClick={onClose} className="px-3 py-2 text-[12px] rounded bg-white/5 hover:bg-white/10 border border-white/10">취소</button>
              <button
                onClick={() => setStep('detail')}
                className="px-4 py-2 text-[12px] font-bold rounded bg-emerald-500 hover:bg-emerald-400 text-white"
              >다음 → 정보 입력</button>
            </>
          ) : (
            <>
              <button onClick={() => setStep('template')} className="px-3 py-2 text-[12px] rounded bg-white/5 hover:bg-white/10 border border-white/10">← 템플릿 다시 선택</button>
              <button
                onClick={handleCreate}
                disabled={creating || !name.trim()}
                className="px-4 py-2 text-[12px] font-bold rounded bg-emerald-500 hover:bg-emerald-400 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >{creating ? '만드는 중...' : '✓ 프로젝트 생성'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
