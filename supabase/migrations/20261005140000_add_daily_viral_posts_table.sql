-- Migration: Add Daily 10-Post Viral Competition Engine table

create table if not exists daily_viral_posts (
  id uuid primary key default gen_random_uuid(),
  run_date date not null default CURRENT_DATE,
  candidate_index int not null,
  topic text not null,
  title text not null,
  hook_text text,
  post_text text not null,
  hashtags text[] default '{}',
  virality_score int not null default 0,
  is_winner boolean default false,
  score_breakdown jsonb default '{}'::jsonb,
  publish_results jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_daily_viral_posts_date on daily_viral_posts (run_date desc, virality_score desc);

-- Disable RLS for backend pipeline access
alter table daily_viral_posts disable row level security;
