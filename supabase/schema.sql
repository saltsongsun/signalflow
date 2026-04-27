-- Signal Flow Map v3 Schema (with Layers)

create table if not exists public.devices (
  id text primary key,
  name text not null,
  model text,
  type text not null check (type in ('video', 'audio', 'combined')),
  role text default 'standard',
  "pgmPort" text,
  normals jsonb not null default '{}'::jsonb,
  location text,
  "roomNumber" text,
  "groupId" text,
  "groupName" text,
  x double precision not null default 0,
  y double precision not null default 0,
  width double precision,
  height double precision,
  inputs jsonb not null default '[]'::jsonb,
  outputs jsonb not null default '[]'::jsonb,
  "inputsMeta" jsonb not null default '{}'::jsonb,
  "outputsMeta" jsonb not null default '{}'::jsonb,
  "physPorts" jsonb not null default '{}'::jsonb,
  routing jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.connections (
  id uuid primary key,
  from_device text not null references public.devices(id) on delete cascade,
  from_port text not null,
  to_device text not null references public.devices(id) on delete cascade,
  to_port text not null,
  conn_type text,
  tie_line text,
  is_patch boolean default false,
  created_at timestamp with time zone default now(),
  unique (to_device, to_port)
);

create table if not exists public.layers (
  id text primary key,
  name text not null,
  color text not null default '#3B82F6',
  visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamp with time zone default now()
);

create table if not exists public.racks (
  id text primary key,
  name text not null,
  location text,
  "totalUnits" integer not null default 42,
  sort_order integer not null default 0,
  created_at timestamp with time zone default now()
);

-- idempotent column additions
alter table public.devices add column if not exists model text;
alter table public.devices add column if not exists width double precision;
alter table public.devices add column if not exists height double precision;
alter table public.devices add column if not exists "inputsMeta" jsonb not null default '{}'::jsonb;
alter table public.devices add column if not exists "outputsMeta" jsonb not null default '{}'::jsonb;
alter table public.devices add column if not exists role text default 'standard';
alter table public.devices add column if not exists "pgmPort" text;
alter table public.devices add column if not exists normals jsonb not null default '{}'::jsonb;
alter table public.devices add column if not exists location text;
alter table public.devices add column if not exists "roomNumber" text;
alter table public.devices add column if not exists "rackId" text;
alter table public.devices add column if not exists "rackUnit" integer;
alter table public.devices add column if not exists rotation integer default 0;
alter table public.devices add column if not exists "imageUrl" text;
alter table public.devices add column if not exists "imageStoragePath" text;
alter table public.devices add column if not exists "audioUrl" text;
alter table public.devices add column if not exists "audioStoragePath" text;
alter table public.devices add column if not exists "selectedInput" text;
alter table public.devices add column if not exists "multiviewLayout" text;
alter table public.devices add column if not exists "multiviewPgmInput" text;
alter table public.devices add column if not exists "multiviewPvwInput" text;
alter table public.devices add column if not exists "multiviewLinkedSwitcherId" text;
alter table public.devices add column if not exists "pvwPort" text;
alter table public.devices add column if not exists "audioChannels" jsonb;
alter table public.devices add column if not exists "audioBuses" jsonb;
alter table public.devices add column if not exists "audioPatch" jsonb;
alter table public.devices add column if not exists "audioOutPatch" jsonb;
alter table public.devices add column if not exists "mixMatrix" jsonb;
alter table public.devices add column if not exists "ioBoxKind" text;
alter table public.devices add column if not exists "ioBoxProtocol" text;
alter table public.devices add column if not exists "ioBoxLinkedMixerId" text;
alter table public.devices add column if not exists "ioBoxSlot" text;
-- 전력 시스템
alter table public.devices add column if not exists "breakers" jsonb;
alter table public.devices add column if not exists "panelMainPhase" text;
alter table public.devices add column if not exists "panelMainCapacity" integer;
alter table public.devices add column if not exists "panelMainKind" text;
alter table public.devices add column if not exists "power" jsonb;
-- 프로젝트 배경 이미지
alter table public.projects add column if not exists "background_image_url" text;
alter table public.projects add column if not exists "background_opacity" integer default 50;
alter table public.projects add column if not exists "background_x" double precision default 0;
alter table public.projects add column if not exists "background_y" double precision default 0;
alter table public.projects add column if not exists "background_scale" double precision default 1;
alter table public.projects add column if not exists "background_width" double precision;
alter table public.projects add column if not exists "background_height" double precision;
alter table public.projects add column if not exists "background_keep_aspect" boolean default false;
alter table public.projects add column if not exists "background_locked" boolean default false;
alter table public.devices add column if not exists "groupId" text;
alter table public.devices add column if not exists "groupName" text;
alter table public.connections add column if not exists conn_type text;
alter table public.connections add column if not exists tie_line text;
alter table public.connections add column if not exists is_patch boolean default false;

-- ============================================================
-- 프로젝트 분리 (멀티 프로젝트 지원)
-- ============================================================
create table if not exists public.projects (
  id text primary key,
  name text not null,
  description text,
  category text default 'general',  -- 'broadcast' | 'audio' | 'general' | 'custom'
  template_id text,                  -- 사용된 템플릿 ID
  passcode text,                     -- 선택적 4자리 비밀번호
  thumbnail_color text default '#3B82F6',
  icon text default '📡',
  -- 프로젝트별 커스터마이징
  terminology jsonb default '{}'::jsonb,  -- 라벨 오버라이드 (예: { "PGM": "주출력" })
  enabled_roles jsonb default '[]'::jsonb, -- 활성화된 장비 역할 목록
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 모든 데이터 테이블에 project_id 추가 (기존 데이터는 'default' 프로젝트로 귀속)
alter table public.devices add column if not exists project_id text default 'default';
alter table public.connections add column if not exists project_id text default 'default';
alter table public.layers add column if not exists project_id text default 'default';
alter table public.racks add column if not exists project_id text default 'default';

-- 인덱스
create index if not exists devices_project_idx on public.devices(project_id);
create index if not exists connections_project_idx on public.connections(project_id);
create index if not exists layers_project_idx on public.layers(project_id);
create index if not exists racks_project_idx on public.racks(project_id);

-- 프로젝트 updated_at 자동 갱신
create or replace function public.touch_project_updated_at()
returns trigger as $$
begin
  if new.project_id is not null then
    update public.projects set updated_at = now() where id = new.project_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists touch_proj_dev on public.devices;
create trigger touch_proj_dev after insert or update or delete on public.devices
  for each row execute function public.touch_project_updated_at();
drop trigger if exists touch_proj_conn on public.connections;
create trigger touch_proj_conn after insert or update or delete on public.connections
  for each row execute function public.touch_project_updated_at();

-- 기본 프로젝트 (기존 데이터 마이그레이션용)
insert into public.projects (id, name, description, category, icon, thumbnail_color)
values ('default', '경남이스포츠 UHD', '기존 데이터 (기본 프로젝트)', 'broadcast', '📡', '#3B82F6')
on conflict (id) do nothing;

-- Realtime
do $$
begin
  perform 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='devices';
  if not found then alter publication supabase_realtime add table public.devices; end if;
  perform 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='connections';
  if not found then alter publication supabase_realtime add table public.connections; end if;
  perform 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='layers';
  if not found then alter publication supabase_realtime add table public.layers; end if;
  perform 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='racks';
  if not found then alter publication supabase_realtime add table public.racks; end if;
  perform 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='projects';
  if not found then alter publication supabase_realtime add table public.projects; end if;
end $$;

-- RLS
alter table public.devices enable row level security;
alter table public.connections enable row level security;
alter table public.layers enable row level security;
alter table public.racks enable row level security;
alter table public.projects enable row level security;

drop policy if exists "Public read projects" on public.projects;
drop policy if exists "Public insert projects" on public.projects;
drop policy if exists "Public update projects" on public.projects;
drop policy if exists "Public delete projects" on public.projects;
create policy "Public read projects" on public.projects for select using (true);
create policy "Public insert projects" on public.projects for insert with check (true);
create policy "Public update projects" on public.projects for update using (true);
create policy "Public delete projects" on public.projects for delete using (true);


drop policy if exists "Public read devices" on public.devices;
drop policy if exists "Public insert devices" on public.devices;
drop policy if exists "Public update devices" on public.devices;
drop policy if exists "Public delete devices" on public.devices;
drop policy if exists "Public read connections" on public.connections;
drop policy if exists "Public insert connections" on public.connections;
drop policy if exists "Public update connections" on public.connections;
drop policy if exists "Public delete connections" on public.connections;
drop policy if exists "Public read layers" on public.layers;
drop policy if exists "Public insert layers" on public.layers;
drop policy if exists "Public update layers" on public.layers;
drop policy if exists "Public delete layers" on public.layers;
drop policy if exists "Public read racks" on public.racks;
drop policy if exists "Public insert racks" on public.racks;
drop policy if exists "Public update racks" on public.racks;
drop policy if exists "Public delete racks" on public.racks;

create policy "Public read devices" on public.devices for select using (true);
create policy "Public insert devices" on public.devices for insert with check (true);
create policy "Public update devices" on public.devices for update using (true);
create policy "Public delete devices" on public.devices for delete using (true);
create policy "Public read connections" on public.connections for select using (true);
create policy "Public insert connections" on public.connections for insert with check (true);
create policy "Public update connections" on public.connections for update using (true);
create policy "Public delete connections" on public.connections for delete using (true);
create policy "Public read layers" on public.layers for select using (true);
create policy "Public insert layers" on public.layers for insert with check (true);
create policy "Public update layers" on public.layers for update using (true);
create policy "Public delete layers" on public.layers for delete using (true);
create policy "Public read racks" on public.racks for select using (true);
create policy "Public insert racks" on public.racks for insert with check (true);
create policy "Public update racks" on public.racks for update using (true);
create policy "Public delete racks" on public.racks for delete using (true);

-- ======================================================================
-- Storage bucket for device source images
-- Run this in the SQL Editor to allow image uploads for 'source' devices.
-- ======================================================================
insert into storage.buckets (id, name, public)
values ('device-images', 'device-images', true)
on conflict (id) do nothing;

-- public access policies for the bucket
drop policy if exists "Public read device-images" on storage.objects;
drop policy if exists "Public upload device-images" on storage.objects;
drop policy if exists "Public update device-images" on storage.objects;
drop policy if exists "Public delete device-images" on storage.objects;

create policy "Public read device-images" on storage.objects
  for select using (bucket_id = 'device-images');
create policy "Public upload device-images" on storage.objects
  for insert with check (bucket_id = 'device-images');
create policy "Public update device-images" on storage.objects
  for update using (bucket_id = 'device-images');
create policy "Public delete device-images" on storage.objects
  for delete using (bucket_id = 'device-images');
