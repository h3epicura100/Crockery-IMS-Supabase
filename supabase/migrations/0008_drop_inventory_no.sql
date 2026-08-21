-- ============================================================================
-- 0008_drop_inventory_no.sql
--
-- inventory_no was never meaningful per-item (the same code, e.g.
-- "IN-Crockery-001", was shared by dozens of unrelated items in the source
-- data) — dropping it. Items are identified by item_name (unique) and the
-- internal uuid id from here on.
-- ============================================================================
alter table item_master drop column inventory_no;
