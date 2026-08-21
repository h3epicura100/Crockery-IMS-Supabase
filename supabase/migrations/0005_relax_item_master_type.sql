-- ============================================================================
-- 0005_relax_item_master_type.sql
--
-- Some Master-Dropdown rows have a blank Inventory Type (source data quality,
-- not something the migration should silently fabricate a value for). The
-- app already renders missing type as "-" (see Dashboard.jsx), so there's no
-- business logic depending on it being present — relaxing to nullable.
-- ============================================================================
alter table item_master alter column inventory_type drop not null;
