// ===== 프로젝트 스냅샷 (복원 지점) =====
// 장비·케이블·레이어·랙 전체를 JSON 한 파일로 저장하고, 문제가 생기면 그 시점으로 되돌린다.
// 저장 위치: 기존 공개 Storage 버킷 'device-images' 의 _snapshots/{projectId}/ 폴더
//   → DB 스키마 변경 없이 동작 (버킷의 기존 공개 정책 사용)
// 파일 이름에 메타데이터를 담아 목록 조회 시 파일을 내려받지 않아도 되게 함:
//   {13자리 타임스탬프}_{manual|auto}_{장비수}_{케이블수}_{이름 base64url}.json
import { supabase } from './supabase';

const BUCKET = 'device-images';
const ROOT = '_snapshots';
const AUTO_KEEP = 30;          // 자동 스냅샷은 프로젝트당 최근 30개만 유지
const INSERT_CHUNK = 200;

export type SnapshotKind = 'manual' | 'auto';

export type SnapshotMeta = {
  path: string;
  createdAt: number;
  kind: SnapshotKind;
  name: string;
  deviceCount: number;
  connectionCount: number;
  size?: number;
};

export type SnapshotData = {
  version: 1;
  projectId: string;
  name: string;
  kind: SnapshotKind;
  createdAt: string;
  devices: any[];
  connections: any[];
  layers: any[];
  racks: any[];
};

// ---- 이름 인코딩 (UTF-8 → base64url) ----
function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): string {
  try {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b + '==='.slice((b.length + 3) % 4));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  } catch {
    return '';
  }
}

const folderOf = (projectId: string) => `${ROOT}/${projectId}`;

function parseName(projectId: string, fileName: string, size?: number): SnapshotMeta | null {
  const m = fileName.match(/^(\d{13})_(manual|auto)_(\d+)_(\d+)_([A-Za-z0-9_-]*)\.json$/);
  if (!m) return null;
  return {
    path: `${folderOf(projectId)}/${fileName}`,
    createdAt: Number(m[1]),
    kind: m[2] as SnapshotKind,
    deviceCount: Number(m[3]),
    connectionCount: Number(m[4]),
    name: b64urlDecode(m[5]),
    size,
  };
}

async function must<T extends { error: any }>(p: PromiseLike<T>): Promise<T> {
  const r = await p;
  if (r.error) throw r.error;
  return r;
}

// 현재 DB에 실제로 저장된 프로젝트 데이터 (로컬 화면 상태가 아니라 서버 기준)
export async function fetchProjectData(projectId: string) {
  const [d, c, l, r] = await Promise.all([
    must((supabase as any).from('devices').select('*').eq('project_id', projectId)),
    must((supabase as any).from('connections').select('*').eq('project_id', projectId)),
    must((supabase as any).from('layers').select('*').eq('project_id', projectId)),
    must((supabase as any).from('racks').select('*').eq('project_id', projectId)),
  ]);
  return {
    devices: (d as any).data ?? [],
    connections: (c as any).data ?? [],
    layers: (l as any).data ?? [],
    racks: (r as any).data ?? [],
  };
}

export async function listSnapshots(projectId: string): Promise<SnapshotMeta[]> {
  const { data, error } = await (supabase as any).storage.from(BUCKET).list(folderOf(projectId), {
    limit: 500,
    sortBy: { column: 'name', order: 'desc' },
  });
  if (error) throw error;
  return ((data ?? []) as any[])
    .map(f => parseName(projectId, f.name, f.metadata?.size))
    .filter((x): x is SnapshotMeta => !!x)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function createSnapshot(projectId: string, name: string, kind: SnapshotKind): Promise<SnapshotMeta> {
  const data = await fetchProjectData(projectId);
  const ts = Date.now();
  const cleanName = (name || '').trim().slice(0, 60);
  const fileName = `${String(ts).padStart(13, '0')}_${kind}_${data.devices.length}_${data.connections.length}_${b64urlEncode(cleanName)}.json`;
  const body: SnapshotData = {
    version: 1, projectId, name: cleanName, kind,
    createdAt: new Date(ts).toISOString(),
    ...data,
  };
  const path = `${folderOf(projectId)}/${fileName}`;
  const { error } = await (supabase as any).storage.from(BUCKET).upload(
    path,
    new Blob([JSON.stringify(body)], { type: 'application/json' }),
    { contentType: 'application/json', upsert: false, cacheControl: '0' },
  );
  if (error) throw error;
  if (kind === 'auto') {
    // 오래된 자동 스냅샷 정리 (실패해도 무시)
    try {
      const all = await listSnapshots(projectId);
      const old = all.filter(s => s.kind === 'auto').slice(AUTO_KEEP).map(s => s.path);
      if (old.length) await (supabase as any).storage.from(BUCKET).remove(old);
    } catch { /* noop */ }
  }
  return parseName(projectId, fileName, undefined)!;
}

export async function loadSnapshot(path: string): Promise<SnapshotData> {
  const { data, error } = await (supabase as any).storage.from(BUCKET).download(path);
  if (error) throw error;
  const json = JSON.parse(await (data as Blob).text());
  if (json?.version !== 1 || !Array.isArray(json.devices)) throw new Error('스냅샷 파일 형식이 올바르지 않습니다.');
  return json as SnapshotData;
}

// 프로젝트 삭제 시 — 그 프로젝트의 스냅샷 파일 전부 삭제
export async function deleteAllSnapshots(projectId: string): Promise<number> {
  const all = await listSnapshots(projectId);
  if (all.length === 0) return 0;
  const { error } = await (supabase as any).storage.from(BUCKET).remove(all.map(s => s.path));
  if (error) throw error;
  return all.length;
}

export async function deleteSnapshot(path: string): Promise<void> {
  const { error } = await (supabase as any).storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

// 복원: ① 지금 상태를 '복원 직전 자동 백업'으로 저장 (실패하면 복원 중단)
//       ② 현재 데이터 삭제 → 스냅샷 데이터 삽입
// 중간에 실패하면 에러에 백업 정보를 담아 던짐 → 화면에서 그 백업으로 다시 복원 가능
export async function restoreSnapshot(projectId: string, path: string): Promise<{ backup: SnapshotMeta; data: SnapshotData }> {
  const snap = await loadSnapshot(path);
  if (snap.projectId !== projectId) throw new Error('다른 프로젝트의 스냅샷입니다.');
  const backup = await createSnapshot(projectId, '복원 직전 자동 백업', 'auto');
  try {
    await must((supabase as any).from('connections').delete().eq('project_id', projectId));
    await must((supabase as any).from('devices').delete().eq('project_id', projectId));
    await must((supabase as any).from('layers').delete().eq('project_id', projectId));
    await must((supabase as any).from('racks').delete().eq('project_id', projectId));
    const tables: Array<[string, any[]]> = [
      ['layers', snap.layers ?? []],
      ['racks', snap.racks ?? []],
      ['devices', snap.devices ?? []],
      ['connections', snap.connections ?? []],
    ];
    for (const [table, rows] of tables) {
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        await must((supabase as any).from(table).insert(rows.slice(i, i + INSERT_CHUNK)));
      }
    }
  } catch (err: any) {
    const e = new Error(`복원 중 오류: ${err?.message ?? err}`) as Error & { backup?: SnapshotMeta };
    e.backup = backup;
    throw e;
  }
  return { backup, data: snap };
}
