-- TargetOS Missing Tables Migration
-- Run this in Supabase Dashboard → SQL Editor

-- Daily Briefing Preferences (per agent)
CREATE TABLE IF NOT EXISTS briefing_prefs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name text NOT NULL UNIQUE,
  enabled boolean DEFAULT true,
  sections jsonb DEFAULT '{"gciProgress":true,"todayTasks":true,"overdueTasks":true,"appointments":true,"quote":true,"teamAnnouncements":false,"pipelineSnapshot":false}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE briefing_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON briefing_prefs FOR ALL USING (true);

-- Automations
CREATE TABLE IF NOT EXISTS automations (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  active boolean DEFAULT false,
  nodes jsonb DEFAULT '[]'::jsonb,
  connections jsonb DEFAULT '[]'::jsonb,
  last_fired timestamptz,
  fire_count integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON automations FOR ALL USING (true);

-- Calendar Events
CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  start_date date NOT NULL,
  start_time time,
  end_date date,
  end_time time,
  all_day boolean DEFAULT false,
  location text,
  type text DEFAULT 'event',
  agent_id uuid REFERENCES auth.users(id),
  agent_name text,
  contact_id uuid,
  listing_id text,
  color text DEFAULT '#CC2200',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON calendar_events FOR ALL USING (true);

-- Open House Visitors
CREATE TABLE IF NOT EXISTS oh_visitors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  open_house_id uuid,
  listing_addr text,
  first_name text,
  last_name text,
  phone text,
  email text,
  agent_id uuid,
  interest_level text DEFAULT 'Unknown',
  notes text,
  follow_up_sent boolean DEFAULT false,
  visited_at timestamptz DEFAULT now()
);
ALTER TABLE oh_visitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON oh_visitors FOR ALL USING (true);

-- Open Houses
CREATE TABLE IF NOT EXISTS open_houses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_addr text NOT NULL,
  date date NOT NULL,
  start_time time,
  end_time time,
  agent_id uuid,
  agent_name text,
  notes text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE open_houses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON open_houses FOR ALL USING (true);

-- Offers
CREATE TABLE IF NOT EXISTS offers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_addr text,
  buyer_name text,
  agent_name text,
  amount numeric,
  down_payment numeric,
  financing text,
  status text DEFAULT 'Pending',
  submitted_at date,
  expiry date,
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON offers FOR ALL USING (true);

-- Gifts
CREATE TABLE IF NOT EXISTS gifts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type text DEFAULT 'Under Contract',
  client_name text,
  address text,
  agent_name text,
  amount numeric,
  vendor text,
  status text DEFAULT 'Pending',
  ordered_date date,
  delivered_date date,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON gifts FOR ALL USING (true);

-- Listing Prep Checklists  
CREATE TABLE IF NOT EXISTS listing_prep (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_addr text NOT NULL,
  agent_name text,
  status text DEFAULT 'Active',
  checklist jsonb DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE listing_prep ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON listing_prep FOR ALL USING (true);

-- User Settings / Preferences
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) UNIQUE,
  display_name text,
  phone text,
  theme text DEFAULT 'light',
  preferences jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON user_settings FOR ALL USING (true);

