-- ============================================================================
-- 0003_cron.sql
--
-- Schedules the daily inventory snapshot. Separate migration file because
-- pg_cron is occasionally gated behind the Supabase dashboard toggle
-- (Project Settings -> Database -> Extensions -> pg_cron) rather than being
-- grantable purely via SQL, depending on plan/project age. If this file
-- fails with a permissions error, enable pg_cron in the dashboard and re-run
-- just this file.
-- ============================================================================

create extension if not exists pg_cron;

-- 18:30 UTC == 00:00 Asia/Kolkata (IST is UTC+5:30, no DST) — fires once
-- just after local midnight, snapshotting the day that just ended.
select cron.schedule(
  'daily-inventory-snapshot',
  '30 18 * * *',
  $$select snapshot_inventory_daily();$$
);
