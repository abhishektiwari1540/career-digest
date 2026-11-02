-- ====================================================================
-- CAREER-DIGEST OPEN-SOURCE HARDENING: ENABLE RLS & RESTRICT WRITE ACCESS
-- ====================================================================

-- Re-enable Row Level Security across all core application tables
ALTER TABLE IF EXISTS profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS brand_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS linkedin_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS job_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS trend_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_reading_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS seo_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_websites ENABLE ROW LEVEL SECURITY;

-- Allow public read access on published content and feed listings
CREATE POLICY "Public read access on job_listings" ON job_listings
  FOR SELECT USING (true);

CREATE POLICY "Public read access on trend_topics" ON trend_topics
  FOR SELECT USING (true);

CREATE POLICY "Public read access on events" ON events
  FOR SELECT USING (true);

CREATE POLICY "Public read access on daily_reports" ON daily_reports
  FOR SELECT USING (true);

CREATE POLICY "Public read access on projects" ON projects
  FOR SELECT USING (true);

CREATE POLICY "Public read access on brand_citations" ON brand_citations
  FOR SELECT USING (true);

CREATE POLICY "Public read access on profile" ON profile
  FOR SELECT USING (true);

CREATE POLICY "Public read access on seo_metadata" ON seo_metadata
  FOR SELECT USING (true);

-- Scoped user access on reading logs
CREATE POLICY "Users can manage their own reading logs" ON user_reading_logs
  FOR ALL USING (
    user_email = auth.jwt() ->> 'email' OR
    is_projectadmin()
  );

-- Scoped user access on websites
CREATE POLICY "Users can manage their own websites" ON user_websites
  FOR ALL USING (
    owner_email = auth.jwt() ->> 'email' OR
    is_projectadmin()
  );

