-- ============================================================================
-- 0013_dropdown_categories.sql
--
-- Extends dropdown_options with 3 new admin-managed categories:
-- inventory_type, department, unit — so Add-Stock (and Master's own Item
-- form) can use strict dropdowns instead of free text. No schema change
-- needed (category is already a free-text column, not an enum) — this just
-- seeds the existing distinct values already in use across item_master, so
-- the dropdowns aren't empty on day one. Admin can prune/rename from
-- Master > Dropdowns afterward.
-- ============================================================================

insert into dropdown_options (category, value)
select 'inventory_type', t.inventory_type
from (select distinct inventory_type from item_master where inventory_type is not null and inventory_type <> '') t
union all
select 'department', t.department
from (select distinct department from item_master where department is not null and department <> '') t
union all
select 'unit', t.unit
from (select distinct unit from item_master where unit is not null and unit <> '') t
on conflict (category, value) do nothing;
