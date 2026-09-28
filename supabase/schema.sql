-- Supabase Schema & Security Migration:
-- Enforces Row Level Security (RLS), Vector Storage, and Blog Engine Tables

create extension if not exists pgcrypto;
create extension if not exists vector;

-- 1. Candidate Profile Table
create table if not exists profile (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  headline text,
  skills text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- 2. Projects Portfolio
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  skills text[] default '{}',
  url text,
  created_at timestamptz not null default now()
);

-- 3. Developer Brand SEO Citations
create table if not exists brand_citations (
  id uuid primary key default gen_random_uuid(),
  platform text not null unique,
  query text,
  indexed_count int default 0,
  sample_url text,
  status text default 'Active',
  updated_at timestamptz not null default now()
);

-- 4. Ingested LinkedIn Export Posts (Private Memory)
create table if not exists linkedin_posts (
  id uuid primary key default gen_random_uuid(),
  posted_at timestamptz,
  content text,
  url text,
  imported_at timestamptz not null default now()
);

-- 5. Job Listings (Adzuna + Remotive + Jobicy)
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

-- 6. Trend Topics
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

-- 7. Events & Hackathons
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

-- 8. Daily Digest Reports
create table if not exists daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  summary_markdown text,
  job_count int,
  trend_count int,
  event_count int,
  created_at timestamptz not null default now()
);

-- 9. Second Brain Memory & Notes
create table if not exists second_brain_memory (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  concept_key text not null unique,
  memory_text text not null,
  platform text default 'linkedin',
  post_text text,
  performance_score numeric default 0.8,
  created_at timestamptz not null default now()
);

-- 10. Multimodal Vectors (gemini-embedding-2 768-d space)
create table if not exists multimodal_vectors (
  id uuid primary key default gen_random_uuid(),
  concept_key text not null,
  content_type text not null,
  embedding_vector jsonb not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 11. User Interactive Reading Logs
create table if not exists user_reading_logs (
  id uuid primary key default gen_random_uuid(),
  article_title text not null,
  url text,
  topic_category text not null,
  reading_time_seconds int not null default 60,
  read_at timestamptz not null default now()
);

-- 12. Single Unified Posts Table (Portfolio Public Read & Second Brain Engine Write)
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  content_markdown text not null,
  status text not null default 'draft', -- 'idea' | 'draft' | 'approved' | 'published' | 'syndicated'
  cover_url text,
  cover_alt text,
  canonical_url text,
  seo_score numeric default 0,
  devto_post_id text,
  blogger_post_id text,
  linkedin_post_id text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 13. Syndication Log (Idempotent Cross-Posting Safety Guard)
create table if not exists syndication_log (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  platform text not null, -- 'devto' | 'blogger' | 'linkedin' | 'bluesky' | 'mastodon'
  external_url text,
  status text not null default 'success',
  syndicated_at timestamptz not null default now(),
  unique (post_id, platform)
);

-- 14. Adzuna Job Market Statistics (Weekly Data Posts)
create table if not exists job_stats (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  location text not null,
  average_salary numeric,
  total_active_jobs int default 0,
  top_demanded_skills text[] default '{}',
  recorded_at timestamptz not null default now()
);

-- 15. SEO Search Console Metrics (Weekly Feedback Loop)
create table if not exists seo_metrics (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  page_url text not null,
  impressions int default 0,
  clicks int default 0,
  ctr numeric default 0,
  position numeric default 0,
  checked_at timestamptz not null default now()
);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES — ENFORCE DATA PRIVACY
-- ====================================================================

ALTER TABLE profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE second_brain_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE multimodal_vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reading_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE syndication_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_metrics ENABLE ROW LEVEL SECURITY;

-- 1. Public Read Policy for Published Blog Posts & Projects (Portfolio Frontend)
CREATE POLICY "Public can read published posts" ON posts
  FOR SELECT USING (status = 'published');

CREATE POLICY "Public can read projects" ON projects
  FOR SELECT USING (true);

-- 2. Service Role Full Access Policies (Backend Engine Only)
CREATE POLICY "Service role full access on profile" ON profile FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on projects" ON projects FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on brand_citations" ON brand_citations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on linkedin_posts" ON linkedin_posts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on job_listings" ON job_listings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on trend_topics" ON trend_topics FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on events" ON events FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on daily_reports" ON daily_reports FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on second_brain_memory" ON second_brain_memory FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on multimodal_vectors" ON multimodal_vectors FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on user_reading_logs" ON user_reading_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on posts" ON posts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on syndication_log" ON syndication_log FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on job_stats" ON job_stats FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on seo_metrics" ON seo_metrics FOR ALL USING (auth.role() = 'service_role');
