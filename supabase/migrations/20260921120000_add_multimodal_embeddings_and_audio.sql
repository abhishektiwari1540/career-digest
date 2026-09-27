-- Migration: Multimodal Embeddings & Audio Briefings Tables

create table if not exists multimodal_vectors (
  id uuid primary key default gen_random_uuid(),
  concept_key text not null,
  content_type text not null default 'text', -- 'text' | 'image' | 'audio'
  embedding_vector text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_multimodal_vectors_concept_key on multimodal_vectors (concept_key);

create table if not exists audio_briefings (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  audio_url text not null,
  duration_seconds int default 120,
  created_at timestamptz not null default now()
);

-- Disable RLS for backend pipeline access
alter table multimodal_vectors disable row level security;
alter table audio_briefings disable row level security;
