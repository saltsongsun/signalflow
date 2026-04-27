'use client';
import { useState } from 'react';
import { supabase, Project, ProjectCategory, PROJECT_CATEGORY_LABELS, PROJECT_CATEGORY_COLORS, DEVICE_ROLES, DEVICE_ROLE_LABELS, DeviceRole } from '../lib/supabase';

type Props = {
  project: Project;
  onClose: () => void;
  onSaved: (updated: Project) => void;
};

// 이미지를 최대 변(longest edge) 기준으로 줄이고 JPEG로 인코딩해 base64 반환.
// 원본이 이미 작으면 그대로 두되 형식만 정리.
// 사용자가 도면에서 scale을 1보다 크게 키우는 것은 별개 — 여기서는 저장 크기만 제한.
async function resizeImageToFit(file: File, maxEdge = 2000, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지 디코딩 실패'));
      img.onload = () => {
        const { naturalWidth: w, naturalHeight: h } = img;
        const longest = Math.max(w, h);
        // 이미 충분히 작으면 원본 데이터 URL 그대로
        if (longest <= maxEdge) {
          resolve(String(reader.result ?? ''));
          return;
        }
        // 비율 유지하며 축소
        const ratio = maxEdge / longest;
        const targetW = Math.round(w * ratio);
        const targetH = Math.round(h * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 컨텍스트 생성 실패'));
          return;
        }
        // 리샘플링 품질을 높이기 위한 옵션
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);
        // PNG는 알파를 유지하지만 용량이 매우 큼.
        // JPEG는 작지만 알파 X. 평면도/단선도는 흰 배경이 보통이라 JPEG로 충분.
        // 단, 원본이 PNG이고 알파가 있을 가능성이 높을 때는 PNG로.
        const isPng = file.type === 'image/png';
        const mime = isPng ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mime, isPng ? undefined : quality);
        resolve(dataUrl);
      };
      img.src = String(reader.result ?? '');
    };
    reader.readAsDataURL(file);
  });
}

export default function ProjectSettingsModal({ project, onClose, onSaved }: Props) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [category, setCategory] = useState<ProjectCategory>(project.category);
  const [icon, setIcon] = useState(project.icon ?? '📡');
  const [thumbnailColor, setThumbnailColor] = useState(project.thumbnail_color ?? '#3B82F6');
  const [passcode, setPasscode] = useState(project.passcode ?? '');
  const [enabledRoles, setEnabledRoles] = useState<DeviceRole[]>(
    (project.enabled_roles && project.enabled_roles.length > 0)
      ? project.enabled_roles as DeviceRole[]
      : [...DEVICE_ROLES]
  );
  const [terminology, setTerminology] = useState<Record<string, string>>(project.terminology ?? {});
  const [newTermKey, setNewTermKey] = useState('');
  const [newTermValue, setNewTermValue] = useState('');
  const [saving, setSaving] = useState(false);
  // 배경 이미지
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(project.background_image_url ?? '');
  const [backgroundOpacity, setBackgroundOpacity] = useState(project.background_opacity ?? 50);
  const [backgroundLocked, setBackgroundLocked] = useState(project.background_locked ?? false);
  const [uploading, setUploading] = useState(false);

  const toggleRole = (r: DeviceRole) => {
    setEnabledRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  };

  const addTerm = () => {
    if (!newTermKey.trim() || !newTermValue.trim()) return;
    setTerminology({ ...terminology, [newTermKey.trim()]: newTermValue.trim() });
    setNewTermKey('');
    setNewTermValue('');
  };

  const removeTerm = (key: string) => {
    const next = { ...terminology };
    delete next[key];
    setTerminology(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Partial<Project> = {
        name: name.trim() || project.name,
        description: description.trim() || undefined,
        category,
        icon,
        thumbnail_color: thumbnailColor,
        passcode: passcode.trim() || undefined,
        enabled_roles: enabledRoles.length === DEVICE_ROLES.length ? [] : enabledRoles,
        terminology,
        background_image_url: backgroundImageUrl || undefined,
        background_opacity: backgroundOpacity,
        background_locked: backgroundLocked,
        background_x: project.background_x ?? 0,
        background_y: project.background_y ?? 0,
        background_scale: project.background_scale ?? 1,
      };
      await (supabase as any).from('projects').update({
        ...updates,
        updated_at: new Date().toISOString(),
      }).eq('id', project.id);
      onSaved({ ...project, ...updates });
    } catch (err) {
      console.error(err);
      alert('저장 실패: ' + (err as any)?.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-ui className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-gradient-to-b from-neutral-900 to-neutral-950 border border-white/15 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="px-5 py-3 border-b border-white/10 flex items-center gap-3">
          <div className="text-2xl">⚙️</div>
          <div className="flex-1">
            <div className="text-[13px] font-bold">프로젝트 설정</div>
            <div className="text-[10.5px] text-neutral-500 font-mono">{project.id}</div>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 text-[11px] rounded bg-white/5 hover:bg-white/10 border border-white/10">✕ 닫기</button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 기본 정보 */}
          <section className="space-y-3">
            <div className="text-[10.5px] uppercase tracking-wider text-neutral-500 font-semibold">기본 정보</div>
            <div>
              <label className="text-[10.5px] text-neutral-400 block mb-1">이름 *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-neutral-950 border border-white/15 rounded px-3 py-2 text-[13px] focus:border-emerald-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10.5px] text-neutral-400 block mb-1">설명</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                className="w-full bg-neutral-950 border border-white/15 rounded px-3 py-2 text-[12px] focus:border-emerald-400 focus:outline-none resize-none"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10.5px] text-neutral-400 block mb-1">아이콘</label>
                <input
                  type="text"
                  value={icon}
                  onChange={e => setIcon(e.target.value)}
                  maxLength={4}
                  placeholder="📡"
                  className="w-full bg-neutral-950 border border-white/15 rounded px-3 py-2 text-[16px] text-center focus:border-emerald-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10.5px] text-neutral-400 block mb-1">색상</label>
                <input
                  type="color"
                  value={thumbnailColor}
                  onChange={e => setThumbnailColor(e.target.value)}
                  className="w-full h-9 rounded cursor-pointer bg-transparent border border-white/15"
                />
              </div>
              <div>
                <label className="text-[10.5px] text-neutral-400 block mb-1">분류</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as ProjectCategory)}
                  className="w-full bg-neutral-950 border border-white/15 rounded px-2 py-2 text-[12px]"
                >
                  {(Object.keys(PROJECT_CATEGORY_LABELS) as ProjectCategory[]).map(c => (
                    <option key={c} value={c}>{PROJECT_CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10.5px] text-neutral-400 block mb-1">접근 비밀번호</label>
              <input
                type="text"
                value={passcode}
                onChange={e => setPasscode(e.target.value)}
                placeholder="비워두면 누구나 접근 가능"
                className="w-full bg-neutral-950 border border-white/15 rounded px-3 py-2 text-[12px] font-mono"
              />
            </div>
          </section>

          {/* 활성 역할 */}
          <section className="space-y-2">
            <div className="text-[10.5px] uppercase tracking-wider text-neutral-500 font-semibold">활성 장비 역할</div>
            <div className="text-[10.5px] text-neutral-500 mb-2">
              이 프로젝트에서 사용할 장비 종류만 선택. 비활성 역할은 툴바와 에디터에 표시되지 않습니다.
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {DEVICE_ROLES.map(r => {
                const active = enabledRoles.includes(r);
                return (
                  <button
                    key={r}
                    onClick={() => toggleRole(r)}
                    className={`px-2 py-1.5 text-[11px] rounded-md border transition ${
                      active
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                        : 'bg-white/[0.02] border-white/10 text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    {DEVICE_ROLE_LABELS[r]}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <button onClick={() => setEnabledRoles([...DEVICE_ROLES])} className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-neutral-400">전체 선택</button>
              <button onClick={() => setEnabledRoles([])} className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-neutral-400">모두 해제</button>
              <span className="text-neutral-500">{enabledRoles.length} / {DEVICE_ROLES.length} 선택됨</span>
            </div>
          </section>

          {/* 배경 이미지 (도면 위에 깔리는 참조 이미지) */}
          <section className="space-y-2">
            <div className="text-[10.5px] uppercase tracking-wider text-neutral-500 font-semibold">배경 이미지</div>
            <div className="text-[10.5px] text-neutral-500 mb-2">
              건물 평면도, 전기 단선도 같은 참조 이미지를 깔고 그 위에 신호 흐름도를 올릴 수 있습니다. 반투명도 조절 가능.
            </div>

            {/* 업로드 / URL 입력 */}
            <div className="space-y-2">
              <label className="cursor-pointer block">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    // 원본 크기 제한은 좀 넉넉하게 (자동 리사이즈로 줄어들 것이므로)
                    if (file.size > 30 * 1024 * 1024) {
                      alert('파일이 너무 큽니다 (30MB 초과).');
                      return;
                    }
                    setUploading(true);
                    try {
                      const resized = await resizeImageToFit(file, 2000, 0.85);
                      setBackgroundImageUrl(resized);
                    } catch (err) {
                      console.error(err);
                      alert('이미지 처리 실패: ' + (err as any)?.message);
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
                <div className="px-3 py-2 text-[12px] text-center rounded border border-dashed border-white/20 hover:border-white/40 hover:bg-white/[0.02] transition">
                  {uploading ? '이미지 최적화 중...' : '📁 이미지 파일 선택 (PNG/JPG)'}
                </div>
              </label>
              <div className="text-[9.5px] text-neutral-500 text-center -mt-1">
                자동으로 최대 2000px로 줄여 저장됩니다. 도면에서 손가락/마우스로 확대 가능.
              </div>
              <div className="text-center text-[10px] text-neutral-600">또는</div>
              <input
                type="text"
                value={backgroundImageUrl.startsWith('data:') ? '(업로드된 이미지 — base64)' : backgroundImageUrl}
                disabled={backgroundImageUrl.startsWith('data:')}
                onChange={e => setBackgroundImageUrl(e.target.value)}
                placeholder="이미지 URL (https://...)"
                className="w-full bg-neutral-950 border border-white/15 rounded px-3 py-1.5 text-[11px] font-mono disabled:opacity-50"
              />
            </div>

            {/* 미리보기 */}
            {backgroundImageUrl && (
              <div className="space-y-2 pt-2">
                <div className="relative h-32 bg-neutral-950 border border-white/10 rounded overflow-hidden flex items-center justify-center">
                  <img
                    src={backgroundImageUrl}
                    alt="배경"
                    className="max-h-full max-w-full object-contain"
                    style={{ opacity: backgroundOpacity / 100 }}
                  />
                  <button
                    onClick={() => setBackgroundImageUrl('')}
                    className="absolute top-1 right-1 px-2 py-1 text-[10px] rounded bg-rose-500/80 hover:bg-rose-500 text-white"
                  >✕ 제거</button>
                </div>

                {/* 반투명도 슬라이더 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10.5px] text-neutral-400">반투명도</label>
                    <span className="text-[10.5px] font-mono text-emerald-300">{backgroundOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={backgroundOpacity}
                    onChange={e => setBackgroundOpacity(parseInt(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>

                {/* 잠금 */}
                <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={backgroundLocked}
                    onChange={e => setBackgroundLocked(e.target.checked)}
                    className="accent-amber-500"
                  />
                  <span className={backgroundLocked ? 'text-amber-300' : 'text-neutral-400'}>
                    🔒 배경 이미지 위치/크기 잠금
                  </span>
                </label>

                <div className="text-[10px] text-neutral-500 bg-white/[0.02] border border-white/10 rounded p-2">
                  💡 도면에서 배경 이미지를 <strong>드래그하여 위치 이동</strong>하거나 <strong>모서리를 끌어 크기 조정</strong>할 수 있습니다 (잠금 해제 상태). 저장 시 자동으로 줄어들었어도 도면에서 1~10배까지 자유롭게 확대할 수 있어요.
                </div>
              </div>
            )}
          </section>

          {/* 용어 오버라이드 */}
          <section className="space-y-2">
            <div className="text-[10.5px] uppercase tracking-wider text-neutral-500 font-semibold">용어 변경 (Terminology)</div>
            <div className="text-[10.5px] text-neutral-500 mb-2">
              방송 특화 용어를 다른 분야 용어로 바꿉니다. 예: "PGM" → "주출력", "스위처" → "선택기"
            </div>
            <div className="space-y-1">
              {Object.entries(terminology).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 px-2 py-1.5 bg-white/[0.03] rounded border border-white/10">
                  <span className="text-[11px] font-mono text-neutral-400 w-32 truncate">{k}</span>
                  <span className="text-neutral-600">→</span>
                  <span className="flex-1 text-[12px] text-emerald-300 truncate">{v}</span>
                  <button
                    onClick={() => removeTerm(k)}
                    className="px-1.5 py-0.5 text-[10px] rounded bg-rose-500/15 hover:bg-rose-500 text-rose-300 hover:text-white"
                  >✕</button>
                </div>
              ))}
              {Object.keys(terminology).length === 0 && (
                <div className="text-[11px] text-neutral-600 italic px-2 py-2">정의된 용어 변경 없음</div>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <input
                type="text"
                value={newTermKey}
                onChange={e => setNewTermKey(e.target.value)}
                placeholder="원본 용어"
                className="flex-1 bg-neutral-950 border border-white/15 rounded px-2 py-1.5 text-[11px] font-mono"
              />
              <span className="text-neutral-600">→</span>
              <input
                type="text"
                value={newTermValue}
                onChange={e => setNewTermValue(e.target.value)}
                placeholder="변경 후"
                onKeyDown={e => { if (e.key === 'Enter') addTerm(); }}
                className="flex-1 bg-neutral-950 border border-white/15 rounded px-2 py-1.5 text-[11px]"
              />
              <button
                onClick={addTerm}
                className="px-3 py-1.5 text-[11px] rounded bg-emerald-500 hover:bg-emerald-400 text-white"
              >＋ 추가</button>
            </div>
          </section>
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-white/10 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-[12px] rounded bg-white/5 hover:bg-white/10 border border-white/10">취소</button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-[12px] font-bold rounded bg-emerald-500 hover:bg-emerald-400 text-white disabled:opacity-50"
          >{saving ? '저장 중...' : '✓ 저장'}</button>
        </div>
      </div>
    </div>
  );
}
