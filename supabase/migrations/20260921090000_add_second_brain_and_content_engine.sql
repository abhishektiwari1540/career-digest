-- Migration: Add Second Brain Memory & 2-Day Multi-Platform Content Engine tables

create table if not exists content_ideas (
  id uuid primary key default gen_random_uuid(),
  target_date date not null,
  topic text not null,
  linkedin_post text,
  twitter_post text,
  blog_outline text,
  reddit_post text,
  hashtags text[] default '{}',
  image_prompt text,
  status text default 'Draft',
  created_at timestamptz not null default now()
);

create index if not exists idx_content_ideas_target_date on content_ideas (target_date desc);

create table if not exists second_brain_memory (
  id uuid primary key default gen_random_uuid(),
  category text not null, -- 'PastPost' | 'Project' | 'Skill' | 'TrendInsight' | 'LearnedTopic'
  concept_key text not null unique,
  memory_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_second_brain_memory_category on second_brain_memory (category);

-- Disable RLS for backend pipeline access
alter table content_ideas disable row level security;
alter table second_brain_memory disable row level security;
