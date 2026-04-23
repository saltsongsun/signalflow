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
alter table public.devices add column if not exists "imageUrl" text;
alter table public.devices add column if not exists "imageStoragePath" text;
alter table public.devices add column if not exists "audioUrl" text;
alter table public.devices add column if not exists "audioStoragePath" text;
alter table public.devices add column if not exists "selectedInput" text;
alter table public.devices add column if not exists "groupId" text;
alter table public.devices add column if not exists "groupName" text;
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
  perform 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='racks';
  if not found then alter publication supabase_realtime add table public.racks; end if;
end $$;

-- RLS
alter table public.devices enable row level security;
alter table public.connections enable row level security;
alter table public.layers enable row level security;
alter table public.racks enable row level security;

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
