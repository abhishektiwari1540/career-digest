-- Migration: v2 Second Brain Schema Updates

alter table content_ideas add column if not exists platform text default 'multi';
alter table content_ideas add column if not exists image_url text;

alter table second_brain_memory add column if not exists platform text default 'linkedin';
alter table second_brain_memory add column if not exists post_text text;
alter table second_brain_memory add column if not exists performance_score numeric default 0.8;

-- Self-profile tracking history
create table if not exists self_profile_metrics (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  metric_name text not null,
  metric_value int default 0,
  details text,
  recorded_at timestamptz not null default now()
);

-- YouTube trend cache
create table if not exists youtube_trends (
  id uuid primary key default gen_random_uuid(),
  video_id text not null unique,
  title text not null,
  channel text,
  url text,
  view_count int default 0,
  summary text,
  fetched_at timestamptz not null default now()
);

-- Disable RLS for backend pipeline access
alter table self_profile_metrics disable row level security;
alter table youtube_trends disable row level security;
