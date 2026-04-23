-- ============================================================
-- Signal Flow Map - Supabase Schema
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- devices 테이블
create table if not exists public.devices (
  id text primary key,
  name text not null,
  type text not null check (type in ('video', 'audio', 'combined')),
  x double precision not null default 0,
  y double precision not null default 0,
  inputs jsonb not null default '[]'::jsonb,
  outputs jsonb not null default '[]'::jsonb,
  "physPorts" jsonb not null default '{}'::jsonb,
  routing jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

-- connections 테이블
create table if not exists public.connections (
  id uuid primary key,
  from_device text not null references public.devices(id) on delete cascade,
  from_port text not null,
  to_device text not null references public.devices(id) on delete cascade,
  to_port text not null,
  created_at timestamp with time zone default now(),
  unique (to_device, to_port)
);

-- Realtime 활성화
alter publication supabase_realtime add table public.devices;
alter publication supabase_realtime add table public.connections;

-- RLS: 공용 단일 맵이므로 anon에게 전체 권한
alter table public.devices enable row level security;
alter table public.connections enable row level security;

create policy "Public read devices" on public.devices for select using (true);
create policy "Public insert devices" on public.devices for insert with check (true);
create policy "Public update devices" on public.devices for update using (true);
create policy "Public delete devices" on public.devices for delete using (true);

create policy "Public read connections" on public.connections for select using (true);
create policy "Public insert connections" on public.connections for insert with check (true);
create policy "Public update connections" on public.connections for update using (true);
create policy "Public delete connections" on public.connections for delete using (true);
