-- ═══════════════════════════════════════════════════════════════
-- TargetOS Phone System — Schema
-- Run this in Supabase SQL Editor before deploying
-- ═══════════════════════════════════════════════════════════════

-- ── EXTEND CALLS TABLE ──────────────────────────────────────────
ALTER TABLE calls ADD COLUMN IF NOT EXISTS direction        text DEFAULT 'Inbound';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS outcome          text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS duration_sec     integer DEFAULT 0;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_url    text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_sid    text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS twilio_call_sid  text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS from_number      text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS to_number        text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS extension        text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS is_voicemail     boolean DEFAULT false;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS voicemail_url    text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS voicemail_transcript text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS contact_id       uuid REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS contact_name     text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS status           text DEFAULT 'completed';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS notes            text;

-- ── EXTENSIONS TABLE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phone_extensions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number       text NOT NULL,       -- e.g. '101', '102'
  label        text NOT NULL,       -- e.g. 'Sales', 'Lazer Direct'
  agent_id     uuid REFERENCES agents(id) ON DELETE SET NULL,
  forward_to   text,               -- cell number to forward to
  active       boolean DEFAULT true,
  voicemail_greeting text,         -- text to be spoken (TTS) when no answer
  order_index  integer DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

-- ── IVR MENUS TABLE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phone_ivr (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  is_active    boolean DEFAULT false,
  greeting_text text,              -- spoken on pickup
  menu_options jsonb DEFAULT '[]', -- [{key:"1", label:"Sales", action:"extension", value:"101"}, ...]
  after_hours_text text,
  voicemail_extension text DEFAULT '9',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ── ROUTING RULES TABLE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS phone_routing (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  rule_type    text NOT NULL,      -- 'round_robin' | 'contact_match' | 'schedule' | 'direct'
  is_active    boolean DEFAULT true,
  priority     integer DEFAULT 0,
  config       jsonb DEFAULT '{}', -- rule-specific config
  created_at   timestamptz DEFAULT now()
);

-- ── VOICEMAILS TABLE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voicemails (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id      uuid REFERENCES calls(id) ON DELETE CASCADE,
  agent_id     uuid REFERENCES agents(id) ON DELETE SET NULL,
  from_number  text,
  contact_id   uuid REFERENCES contacts(id) ON DELETE SET NULL,
  contact_name text,
  recording_url text,
  transcript   text,
  duration_sec integer DEFAULT 0,
  is_read      boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE phone_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_ivr        ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_routing    ENABLE ROW LEVEL SECURITY;
ALTER TABLE voicemails       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON phone_extensions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON phone_ivr        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON phone_routing    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON voicemails       FOR ALL TO authenticated USING (true) WITH CHECK (true);
