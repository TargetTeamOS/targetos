-- ============================================================================
-- A4_rollback.sql — reverses A4_news_sources.sql.
-- DATA SAFETY: drops only the new public.news_sources config table and its RPCs.
-- No business data exists in or is referenced by these objects.
-- ============================================================================
begin;
drop function if exists public.app_news_source_delete(uuid);
drop function if exists public.app_news_source_upsert(jsonb);
drop function if exists public.app_news_sources_active();
drop function if exists public.app_news_sources_list();
drop table if exists public.news_sources;  -- cascades its policy
update public._app_migrations set status='rolled_back', rolled_back_at=now()
  where name='A4_news_sources';
commit;
select 'A4 rolled back' as status;
