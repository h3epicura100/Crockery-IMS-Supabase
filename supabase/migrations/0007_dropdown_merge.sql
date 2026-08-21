-- ============================================================================
-- 0007_dropdown_merge.sql
--
-- Merges issuers + event_types into one admin-managed dropdown table.
-- issues.issuer_id / issues.event_type_id (FKs) become issues.issuer /
-- issues.event_type (plain text) — no FK, matching how Master-Dropdown
-- actually behaved (a flat suggestion list, not an enforced relationship).
-- ============================================================================

create table dropdown_options (
  id         uuid primary key default gen_random_uuid(),
  category   text not null,          -- 'issuer' | 'event_type' (extensible to future dropdown kinds)
  value      text not null,
  created_at timestamptz not null default now(),
  unique (category, value)
);

insert into dropdown_options (category, value)
select 'issuer', name from issuers
union all
select 'event_type', name from event_types;

alter table issues add column issuer text;
alter table issues add column event_type text;

update issues i set issuer = iss.name from issuers iss where i.issuer_id = iss.id;
update issues i set event_type = et.name from event_types et where i.event_type_id = et.id;

alter table issues drop column issuer_id;
alter table issues drop column event_type_id;

drop table issuers;
drop table event_types;

alter table dropdown_options enable row level security;
create policy dropdown_options_open_policy on dropdown_options
  for all to anon, authenticated using (true) with check (true);
