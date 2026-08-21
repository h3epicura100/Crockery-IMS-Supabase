-- ============================================================================
-- 0015_merge_duplicate_departments.sql
--
-- Merges case-variant duplicate department values inherited from the
-- original spreadsheet data: 'wooden'/'WOODEN' -> 'Wooden', 'GLASS' -> 'Glass'
-- (canonical Title Case, matching the style of the rest of the department
-- list, e.g. "Green Glossy GG", "Bluseh Blue"). Department + inventory_type
-- together already disambiguate items (e.g. Wooden/Decor vs Wooden/Disposal
-- are still distinct rows) — this only fixes the inconsistent text casing.
-- ============================================================================

update item_master set department = 'Wooden' where department in ('wooden', 'WOODEN');
update item_master set department = 'Glass' where department = 'GLASS';

delete from dropdown_options where category = 'department' and value in ('wooden', 'WOODEN');
insert into dropdown_options (category, value) values ('department', 'Wooden')
  on conflict (category, value) do nothing;

delete from dropdown_options where category = 'department' and value = 'GLASS';
-- 'Glass' already exists in dropdown_options, no insert needed.
