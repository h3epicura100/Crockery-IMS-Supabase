-- ============================================================================
-- 0004_rls.sql
--
-- RLS is enabled on every table with a single permissive policy each,
-- matching the CURRENT app's trust model: the existing Apps Script backend
-- has no auth check on any action and allows any origin (see
-- apps-script/Code.gs setCorsHeaders). Since the frontend does its own
-- custom username/password check (profiles table) rather than using
-- Supabase Auth, there is no auth.uid() to key policies off of yet.
--
-- This is a DELIBERATE parity choice, not an oversight: it keeps behavior
-- identical during cutover. RLS is still turned ON (not skipped) so that
-- tightening later is a policy change only — never requires re-touching
-- application code. Recommended next step once this is stable: put writes
-- behind a Supabase Edge Function using the service-role key, and drop the
-- anon key's write policies.
-- ============================================================================

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'item_master', 'issuers', 'event_types', 'profiles',
    'stock_transactions', 'issues', 'returns',
    'inventory_current', 'inventory_daily_snapshot'
  ])
  loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy %I on %I for all to anon, authenticated using (true) with check (true);',
      t || '_open_policy', t
    );
  end loop;
end;
$$;
