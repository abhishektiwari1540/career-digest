-- Migration: Universal Social Publisher & SEO Rank Tracker Tables

create table if not exists platform_posts (
  id uuid primary key default gen_random_uuid(),
  content_id text,
  platform text not null,
  status text not null default 'Draft', -- 'Draft' | 'Published' | 'Failed' | 'Scheduled'
  external_id text,
  post_url text,
  error_message text,
  posted_at timestamptz not null default now()
);

create index if not exists idx_platform_posts_platform on platform_posts (platform);
create index if not exists idx_platform_posts_status on platform_posts (status);

create table if not exists seo_rank_history (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  rank_position numeric default 0,
  indexed_status text default 'Indexed',
  checked_at timestamptz not null default now()
);

create index if not exists idx_seo_rank_history_checked_at on seo_rank_history (checked_at desc);

-- Disable RLS for backend pipeline access
alter table platform_posts disable row level security;
alter table seo_rank_history disable row level security;
