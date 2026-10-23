-- ====================================================================
-- CAREER-DIGEST MASTER SECURITY, RBAC & OMNISCIENT TELEMETRY DDL
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. SYSTEM USERS & RBAC TABLE
CREATE TABLE IF NOT EXISTS system_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', -- 'projectadmin' | 'instance_owner' | 'user'
  full_name TEXT DEFAULT 'Career-Digest Developer',
  is_root_owner BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Abhishek Tiwari as Permanent Root Superadmin
INSERT INTO system_users (email, password_hash, role, full_name, is_root_owner, is_active)
VALUES (
  'abhishektiwari1540@gmail.com',
  crypt('12345678', gen_salt('bf', 12)),
  'projectadmin',
  'Abhishek Tiwari',
  TRUE,
  TRUE
)
ON CONFLICT (email) DO UPDATE SET
  role = 'projectadmin',
  is_root_owner = TRUE,
  is_active = TRUE;

-- 2. ACCESS & ACTIVATION REQUESTS (CLONER INGESTION QUEUE)
CREATE TABLE IF NOT EXISTS access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_email TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  ip_address TEXT,
  country TEXT,
  city TEXT,
  device_os TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  assigned_license_key TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES system_users(id)
);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
CREATE INDEX IF NOT EXISTS idx_access_requests_email ON access_requests(requester_email);

-- 3. REGISTERED NODES & CLONED INSTANCES REGISTRY
CREATE TABLE IF NOT EXISTS registered_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key TEXT UNIQUE NOT NULL,
  owner_email TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  city TEXT,
  country TEXT,
  last_ip TEXT,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_revoked BOOLEAN DEFAULT FALSE,
  revocation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_registered_instances_license ON registered_instances(license_key);
CREATE INDEX IF NOT EXISTS idx_registered_instances_email ON registered_instances(owner_email);

-- 4. GLOBAL OMNISCIENT CHAT & PROMPT TELEMETRY
CREATE TABLE IF NOT EXISTS global_chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID REFERENCES registered_instances(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  session_id TEXT NOT NULL,
  preset_mode TEXT DEFAULT 'deep_planner',
  prompt_text TEXT NOT NULL,
  assistant_response TEXT,
  truth_score NUMERIC,
  ip_address TEXT,
  city TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_global_chat_logs_email ON global_chat_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_global_chat_logs_created ON global_chat_logs(created_at DESC);

-- 5. GLOBAL SEARCH QUERY TELEMETRY (LIVE SEARCH FEED)
CREATE TABLE IF NOT EXISTS global_search_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID REFERENCES registered_instances(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  search_type TEXT NOT NULL DEFAULT 'open_source_vector', -- 'open_source_vector' | 'second_brain' | 'jobs'
  search_query TEXT NOT NULL,
  category_filter TEXT DEFAULT 'all',
  results_count INT DEFAULT 0,
  top_match_title TEXT,
  city TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_global_search_logs_query ON global_search_logs(search_query);
CREATE INDEX IF NOT EXISTS idx_global_search_logs_created ON global_search_logs(created_at DESC);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES — ENFORCE ABHISHEK TIWARI SUPREMACY
-- ====================================================================

ALTER TABLE system_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE registered_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_chat_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_search_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_projectadmin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    auth.jwt() ->> 'email' = 'abhishektiwari1540@gmail.com' OR
    EXISTS (
      SELECT 1 FROM system_users 
      WHERE email = auth.jwt() ->> 'email' AND role = 'projectadmin'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Projectadmin full access on system_users" ON system_users
  FOR ALL USING (is_projectadmin());

CREATE POLICY "Projectadmin full access on access_requests" ON access_requests
  FOR ALL USING (is_projectadmin());

CREATE POLICY "Projectadmin full access on registered_instances" ON registered_instances
  FOR ALL USING (is_projectadmin());

CREATE POLICY "Projectadmin full access on global_chat_logs" ON global_chat_logs
  FOR ALL USING (is_projectadmin());

CREATE POLICY "Projectadmin full access on global_search_logs" ON global_search_logs
  FOR ALL USING (is_projectadmin());

CREATE POLICY "Cloners can view own user record" ON system_users
  FOR SELECT USING (email = auth.jwt() ->> 'email');
