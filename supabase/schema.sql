-- Run this once in the Supabase SQL editor for a new project.

create extension if not exists pgcrypto;

create table if not exists profile (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  headline text,
  skills text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- Projects portfolio for candidate project cross-referencing
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  skills text[] default '{}',
  url text,
  created_at timestamptz not null default now()
);

-- Developer brand SEO presence tracking across major platforms
create table if not exists brand_citations (
  id uuid primary key default gen_random_uuid(),
  platform text not null unique,
  query text,
  indexed_count int default 0,
  sample_url text,
  status text default 'Active',
  updated_at timestamptz not null default now()
);

-- Imported once from your official LinkedIn data export (see README) —
-- never from live scraping.
create table if not exists linkedin_posts (
  id uuid primary key default gen_random_uuid(),
  posted_at timestamptz,
  content text,
  url text,
  imported_at timestamptz not null default now()
);

create table if not exists job_listings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  title text,
  company text,
  location text,
  url text,
  description_snippet text,
  skill_match_score numeric,
  match_reasoning text,
  fetched_at timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists idx_job_listings_fetched_at on job_listings (fetched_at desc);

create table if not exists trend_topics (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  title text,
  url text,
  relevance_note text,
  fetched_at timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists idx_trend_topics_fetched_at on trend_topics (fetched_at desc);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  source text,
  title text,
  url text,
  starts_at timestamptz,
  category text,
  location text,
  fetched_at timestamptz not null default now()
);

-- One row per day: the "versioning" for the whole system is just this
-- table's history. Nothing above needs a separate audit log.
create table if not exists daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  summary_markdown text,
  job_count int,
  trend_count int,
  event_count int,
  created_at timestamptz not null default now()
);

