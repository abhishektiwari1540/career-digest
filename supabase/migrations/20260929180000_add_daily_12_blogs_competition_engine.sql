-- Migration: Add Daily 12-Blog Competition Engine & Champion tables

create table if not exists daily_blog_candidates (
  id uuid primary key default gen_random_uuid(),
  run_date date not null default CURRENT_DATE,
  candidate_index int not null,
  topic text not null,
  target_keyword text not null,
  title text not null,
  slug text not null,
  meta_description text,
  tldr_summary text,
  content_markdown text not null,
  json_ld_schema jsonb default '{}'::jsonb,
  cover_url text,
  cover_alt text,
  hashtags text[] default '{}',
  seo_score int not null default 0,
  is_champion boolean default false,
  score_breakdown jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_daily_blog_candidates_date on daily_blog_candidates (run_date desc, seo_score desc);

create table if not exists daily_champion_blogs (
  id uuid primary key default gen_random_uuid(),
  publish_date date not null unique default CURRENT_DATE,
  title text not null,
  slug text not null,
  target_keyword text not null,
  meta_description text,
  tldr_summary text,
  content_markdown text not null,
  json_ld_schema jsonb default '{}'::jsonb,
  cover_url text,
  cover_alt text,
  hashtags text[] default '{}',
  seo_score int not null default 0,
  synced_to_portfolio boolean default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_daily_champion_blogs_date on daily_champion_blogs (publish_date desc);

-- Disable RLS for backend API access
alter table daily_blog_candidates disable row level security;
alter table daily_champion_blogs disable row level security;
