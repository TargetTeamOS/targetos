-- ═══════════════════════════════════════════════════════════════
-- TARGETOS EDGE FUNCTIONS SQL SETUP
-- Run this in Supabase → SQL Editor after deploying Edge Functions
-- ═══════════════════════════════════════════════════════════════

-- ── STEP 1: Enable pg_cron extension ──────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── STEP 2: Daily briefing cron — 7AM ET (12PM UTC) ──────────
SELECT cron.schedule(
  'daily-briefing',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://sgrnyvdsyahmypibjarx.supabase.co/functions/v1/daily-briefing',
    headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ── STEP 3: No-activity check cron — 8AM ET (1PM UTC) ────────
SELECT cron.schedule(
  'no-activity-check',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://sgrnyvdsyahmypibjarx.supabase.co/functions/v1/no-activity-check',
    headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ── STEP 4: Overdue task alert cron — 8:30AM ET (1:30PM UTC) ─
SELECT cron.schedule(
  'task-overdue-check',
  '30 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://sgrnyvdsyahmypibjarx.supabase.co/functions/v1/task-overdue-check',
    headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ── STEP 5: Database webhooks for automation engine ───────────
-- These fire the automation-engine whenever contacts or deals change

-- Contacts webhook
CREATE OR REPLACE FUNCTION notify_automation_contacts()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://sgrnyvdsyahmypibjarx.supabase.co/functions/v1/automation-engine',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := json_build_object(
      'type', TG_OP,
      'table', 'contacts',
      'record', row_to_json(NEW),
      'old_record', row_to_json(OLD)
    )::jsonb
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS automation_contacts_trigger ON contacts;
CREATE TRIGGER automation_contacts_trigger
  AFTER INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION notify_automation_contacts();

-- Deals webhook
CREATE OR REPLACE FUNCTION notify_automation_deals()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://sgrnyvdsyahmypibjarx.supabase.co/functions/v1/automation-engine',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := json_build_object(
      'type', TG_OP,
      'table', 'deals',
      'record', row_to_json(NEW),
      'old_record', row_to_json(OLD)
    )::jsonb
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS automation_deals_trigger ON deals;
CREATE TRIGGER automation_deals_trigger
  AFTER INSERT OR UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION notify_automation_deals();

-- Listings webhook
CREATE OR REPLACE FUNCTION notify_automation_listings()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://sgrnyvdsyahmypibjarx.supabase.co/functions/v1/automation-engine',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := json_build_object(
      'type', TG_OP,
      'table', 'listings',
      'record', row_to_json(NEW),
      'old_record', row_to_json(OLD)
    )::jsonb
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS automation_listings_trigger ON listings;
CREATE TRIGGER automation_listings_trigger
  AFTER INSERT OR UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION notify_automation_listings();

-- ── STEP 6: Also run the remaining tables SQL ─────────────────
CREATE TABLE IF NOT EXISTS listings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  addr text NOT NULL, city text, state text DEFAULT 'NY', zip text,
  price numeric, beds text, baths text, sqft text, type text,
  status text DEFAULT 'Active', tax text, lock_code text, mls text,
  seller_name text, budget numeric DEFAULT 2000, days integer DEFAULT 0,
  notes text, agents text[], spend jsonb DEFAULT '[]', showings jsonb DEFAULT '[]',
  agent_id uuid, agent_name text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all listings" ON listings;
CREATE POLICY "Allow all listings" ON listings FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS deals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  addr text NOT NULL, agent_name text, agent_id uuid,
  side text DEFAULT 'Buyer', stage text DEFAULT 'Offer Accapted',
  prod numeric DEFAULT 0, gci numeric DEFAULT 0,
  ao_date date, close_date date, source text, client_name text,
  buyer_agent text, notes text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all deals" ON deals;
CREATE POLICY "Allow all deals" ON deals FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  addr text NOT NULL, agent_name text, side text DEFAULT 'Buyer',
  price numeric, gci numeric, ctc text DEFAULT 'Offer Accapted',
  close_date date, client_name text, atty text, mtg text, title_co text,
  punch_list jsonb DEFAULT '[]', notes text, status text DEFAULT 'Active',
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all transactions" ON transactions;
CREATE POLICY "Allow all transactions" ON transactions FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS calls (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_name text, contact_id uuid, agent_name text, agent_id uuid,
  direction text DEFAULT 'Outbound', duration text, outcome text, phone text,
  called_at timestamptz DEFAULT now()
);
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all calls" ON calls;
CREATE POLICY "Allow all calls" ON calls FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS announcements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL, body text, type text DEFAULT 'info',
  agent_name text, agent_id uuid, pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all announcements" ON announcements;
CREATE POLICY "Allow all announcements" ON announcements FOR ALL USING (true);

