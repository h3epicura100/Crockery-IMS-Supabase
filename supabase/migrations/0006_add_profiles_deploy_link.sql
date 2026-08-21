-- ============================================================================
-- 0006_add_profiles_deploy_link.sql
--
-- profiles.deploy_link was specified in 0001_init_schema.sql but the deployed
-- table ended up without it (root cause unclear — recorded here so a fresh
-- `psql -f` run of all migrations in order is idempotent and self-healing).
-- ============================================================================
alter table profiles add column if not exists deploy_link text;
