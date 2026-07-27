-- ═══════════════════════════════════════════════════════════════
-- Connected Email — Phase 2: normalized schema + RLS (idempotent)
-- Adds the new tables. Does NOT touch integration_accounts (kept for
-- backfill + rollback). Tokens are stored ENCRYPTED (AES-256-GCM via the
-- server-only api/_lib/emailCrypto.js). Frontends can read connection
-- METADATA but never the encrypted token columns — enforced with
-- column-level GRANTs (row RLS cannot hide columns). All writes go through
-- the service-role backend; there are no INSERT/UPDATE/DELETE policies for
-- the authenticated role.
--
-- Reuses helpers from sql/private_contacts_rls.sql:
--   public.current_agent_id()  public.current_agent_is_admin()
-- Run AFTER that file. Rollback: sql/email_phase2_rollback.sql
-- ═══════════════════════════════════════════════════════════════

-- ── email_connections ────────────────────────────────────────────
create table if not exists email_connections (
  id                          uuid primary key default gen_random_uuid(),
  crm_user_id                 uuid not null references agents(id) on delete cascade,
  provider                    text not null check (provider in ('google','microsoft')),
  provider_account_id         text,
  email_address               text,
  display_name                text,
  tenant_id                   text,
  encrypted_access_token      text,     -- AES-256-GCM envelope (never granted to authenticated)
  encrypted_refresh_token     text,     -- AES-256-GCM envelope (never granted to authenticated)
  access_token_expires_at     timestamptz,
  granted_scopes              text,
  status                      text not null default 'active'
                              check (status in ('active','expired','revoked','error','disconnected')),
  is_primary                  boolean not null default false,
  last_sync_at                timestamptz,
  last_error_code             text,
  last_error_at               timestamptz,
  source_integration_account_id uuid,   -- link back to integration_accounts (idempotent backfill + rollback)
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  disconnected_at             timestamptz
);
-- Idempotent backfill key + dedupe of a provider account per user.
create unique index if not exists uq_email_conn_source
  on email_connections (source_integration_account_id)
  where source_integration_account_id is not null;
create unique index if not exists uq_email_conn_provider_acct
  on email_connections (crm_user_id, provider, provider_account_id)
  where provider_account_id is not null;
-- Exactly one primary connection per CRM user.
create unique index if not exists uq_email_conn_one_primary
  on email_connections (crm_user_id) where is_primary;
create index if not exists idx_email_conn_user on email_connections (crm_user_id);

-- ── email_sync_state (server-only) ───────────────────────────────
create table if not exists email_sync_state (
  connection_id             uuid primary key references email_connections(id) on delete cascade,
  provider                  text,
  gmail_history_id          text,
  microsoft_delta_link      text,
  provider_subscription_id  text,
  subscription_expires_at   timestamptz,
  webhook_client_state_hash text,
  watch_status              text,
  last_notification_at      timestamptz,
  last_successful_sync_at   timestamptz,
  retry_count               int not null default 0,
  updated_at                timestamptz not null default now()
);
create unique index if not exists uq_sync_subscription
  on email_sync_state (provider_subscription_id)
  where provider_subscription_id is not null;

-- ── email_threads ────────────────────────────────────────────────
create table if not exists email_threads (
  id                       uuid primary key default gen_random_uuid(),
  owner_crm_user_id        uuid references agents(id) on delete set null,
  provider                 text,
  connection_id            uuid references email_connections(id) on delete set null,
  provider_thread_id       text,
  microsoft_conversation_id text,
  subject                  text,
  contact_id               uuid references contacts(id) on delete set null,
  deal_id                  uuid,
  listing_id               uuid,
  transaction_id           uuid,
  created_at               timestamptz not null default now(),
  last_message_at          timestamptz
);
create unique index if not exists uq_thread_provider_thread
  on email_threads (connection_id, provider_thread_id)
  where provider_thread_id is not null;
create index if not exists idx_thread_owner on email_threads (owner_crm_user_id);
create index if not exists idx_thread_contact on email_threads (contact_id);

-- ── email_messages ───────────────────────────────────────────────
create table if not exists email_messages (
  id                       uuid primary key default gen_random_uuid(),
  email_thread_id          uuid references email_threads(id) on delete cascade,
  connection_id            uuid references email_connections(id) on delete set null,
  provider                 text,
  provider_message_id      text,
  internet_message_id      text,
  in_reply_to              text,
  "references"             text,
  direction                text check (direction in ('inbound','outbound')),
  from_address             text,
  to_addresses             text[],
  cc_addresses             text[],
  bcc_addresses            text[],
  subject                  text,
  body_text                text,
  body_html                text,
  sent_at                  timestamptz,
  received_at              timestamptz,
  has_attachments          boolean not null default false,
  provider_payload_metadata jsonb,
  owner_crm_user_id        uuid references agents(id) on delete set null,  -- denormalized for RLS
  contact_id               uuid references contacts(id) on delete set null, -- denormalized for RLS
  created_at               timestamptz not null default now()
);
create unique index if not exists uq_msg_provider_msg
  on email_messages (connection_id, provider_message_id)
  where provider_message_id is not null;
create unique index if not exists uq_msg_internet_id
  on email_messages (provider, internet_message_id)
  where internet_message_id is not null;
create index if not exists idx_msg_thread on email_messages (email_thread_id);
create index if not exists idx_msg_owner on email_messages (owner_crm_user_id);
create index if not exists idx_msg_contact on email_messages (contact_id);

-- ── email_delivery_events ────────────────────────────────────────
create table if not exists email_delivery_events (
  id                     uuid primary key default gen_random_uuid(),
  message_id             uuid references email_messages(id) on delete cascade,
  provider               text,
  event_type             text,
  status                 text,
  error_code             text,
  error_message_sanitized text,
  occurred_at            timestamptz not null default now()
);
create index if not exists idx_delivery_message on email_delivery_events (message_id);

-- ── system_email_configuration (config only — NO tokens here) ────
create table if not exists system_email_configuration (
  provider           text primary key default 'microsoft',
  mailbox_address    text,
  enabled            boolean not null default false,
  reply_sync_enabled boolean not null default false,
  last_test_at       timestamptz,
  last_test_status   text,
  updated_at         timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════
alter table email_connections          enable row level security;
alter table email_sync_state            enable row level security;
alter table email_threads               enable row level security;
alter table email_messages              enable row level security;
alter table email_delivery_events       enable row level security;
alter table system_email_configuration  enable row level security;

-- email_connections: users read their OWN connection metadata; admins read
-- all metadata. Token columns are withheld via column GRANTs below, so no
-- SELECT can return them to the authenticated role. No write policies →
-- inserts/updates/deletes happen only through the service-role backend.
drop policy if exists email_conn_select on email_connections;
create policy email_conn_select on email_connections
for select to authenticated
using (crm_user_id = public.current_agent_id() or public.current_agent_is_admin());

-- Column-level protection for tokens (row RLS cannot hide columns).
revoke all on table email_connections from anon;
revoke all on table email_connections from authenticated;
grant select (
  id, crm_user_id, provider, provider_account_id, email_address, display_name,
  tenant_id, access_token_expires_at, granted_scopes, status, is_primary,
  last_sync_at, last_error_code, last_error_at, source_integration_account_id,
  created_at, updated_at, disconnected_at
) on table email_connections to authenticated;
-- encrypted_access_token / encrypted_refresh_token are intentionally NOT granted.

-- email_sync_state: server-only. RLS enabled, NO policies → authenticated
-- and anon get nothing; the service role bypasses RLS.
revoke all on table email_sync_state from anon, authenticated;

-- email_threads: visible to the owner, admins, or anyone who may access the
-- linked contact (mirrors sql/private_contacts_rls.sql contacts_select).
drop policy if exists email_threads_select on email_threads;
create policy email_threads_select on email_threads
for select to authenticated
using (
  owner_crm_user_id = public.current_agent_id()
  or public.current_agent_is_admin()
  or (contact_id is not null and exists (
        select 1 from contacts c
        where c.id = email_threads.contact_id
          and (c.is_private = false
               or c.agent_id = public.current_agent_id()
               or public.current_agent_is_admin())
     ))
);

-- email_messages: same visibility rule (owner / admin / accessible contact).
drop policy if exists email_messages_select on email_messages;
create policy email_messages_select on email_messages
for select to authenticated
using (
  owner_crm_user_id = public.current_agent_id()
  or public.current_agent_is_admin()
  or (contact_id is not null and exists (
        select 1 from contacts c
        where c.id = email_messages.contact_id
          and (c.is_private = false
               or c.agent_id = public.current_agent_id()
               or public.current_agent_is_admin())
     ))
);

-- email_delivery_events: visible only when the parent message is visible.
drop policy if exists email_delivery_select on email_delivery_events;
create policy email_delivery_select on email_delivery_events
for select to authenticated
using (exists (
  select 1 from email_messages m
  where m.id = email_delivery_events.message_id
    and (m.owner_crm_user_id = public.current_agent_id()
         or public.current_agent_is_admin()
         or (m.contact_id is not null and exists (
              select 1 from contacts c
              where c.id = m.contact_id
                and (c.is_private = false
                     or c.agent_id = public.current_agent_id()
                     or public.current_agent_is_admin()))))
));

-- system_email_configuration: admins may read config metadata (no tokens
-- are stored here). Writes are service-role only.
drop policy if exists system_email_config_select on system_email_configuration;
create policy system_email_config_select on system_email_configuration
for select to authenticated
using (public.current_agent_is_admin());

-- Seed the single system-config row (disabled until Phase 6).
insert into system_email_configuration (provider, mailbox_address, enabled, reply_sync_enabled)
values ('microsoft', null, false, false)
on conflict (provider) do nothing;

-- VERIFY (as service role): all six tables exist with rowsecurity = true.
select relname, relrowsecurity
from pg_class
where relname in ('email_connections','email_sync_state','email_threads',
                  'email_messages','email_delivery_events','system_email_configuration')
order by relname;
