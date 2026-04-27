'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SignalFlowMap from '@/components/SignalFlowMap';
import { supabase, Project } from '@/lib/supabase';

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();
      if (error || !data) {
        setNotFound(true);
      } else {
        setProject(data as Project);
      }
      setLoading(false);
    })();
  }, [projectId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-neutral-500">불러오는 중...</div>
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-3">
        <div className="text-3xl">📭</div>
        <div className="text-base">프로젝트를 찾을 수 없습니다.</div>
        <div className="text-[12px] text-neutral-500 font-mono">{projectId}</div>
        <button
          onClick={() => router.push('/')}
          className="mt-3 px-4 py-2 text-[12px] rounded bg-sky-500 hover:bg-sky-400 text-white"
        >← 프로젝트 목록</button>
      </div>
    );
  }

  return <SignalFlowMap project={project!} />;
}
