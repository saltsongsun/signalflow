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
alter table public.connections add column if not exists conn_type text;
alter table public.connections add column if not exists tie_line text;
alter table public.connections add column if not exists is_patch boolean default false;

-- Realtime
do $$
begin
  perform 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='devices';
  if not found then alter publication supabase_realtime add table public.devices; end if;
  perform 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='connections';
  if not found then alter publication supabase_realtime add table public.connections; end if;
  perform 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='layers';
  if not found then alter publication supabase_realtime add table public.layers; end if;
end $$;

-- RLS
alter table public.devices enable row level security;
alter table public.connections enable row level security;
alter table public.layers enable row level security;

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
