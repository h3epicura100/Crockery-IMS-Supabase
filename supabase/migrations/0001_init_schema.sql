-- ============================================================================
-- Crockery IMS — Google Sheets → Supabase migration
-- 0001_init_schema.sql
--
-- Source-of-truth mapping (see /task.txt for the original sheet layout):
--   Master-Dropdown     -> item_master + issuers + event_types
--   Login               -> profiles
--   Add-Stock             \
--   Re-Purchase            > stock_transactions (source enum distinguishes them)
--   Issued              -> issues
--   Return              -> returns
--   INVENTORY           -> inventory_current   (maintained live by triggers)
--   History INVENTORY   -> inventory_daily_snapshot (populated by pg_cron)
--
-- Business rule (explicit from the user): live stock (inventory_current) is
-- only ever affected by: (1) stock additions, (2) re-purchases, (3) damage/
-- missing recorded on a return. Ordinary issue / return-without-damage moves
-- quantity temporarily but never permanently reduces owned stock.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type role_enum as enum ('admin', 'user');
create type stock_source_enum as enum ('add_stock', 're_purchase');
create type for_type_enum as enum ('H3', 'Rent');

-- ----------------------------------------------------------------------------
-- Reference / master tables
-- ----------------------------------------------------------------------------

-- One row per unique item name (business rule: item name must be unique).
-- Source: Master-Dropdown [Inventory Type, Items Name, Department, Unit,
-- Rental Price, Damage Price]. The sheet's duplicate 4th "Inventory Type"
-- column and blank rows are dropped as redundant during backfill.
create table item_master (
  id              uuid primary key default gen_random_uuid(),
  item_name       text not null unique,
  inventory_type  text not null,
  department      text,
  unit            text,
  rental_price    numeric(12, 2) not null default 0,
  damage_price    numeric(12, 2) not null default 0,
  inventory_no    text,                 -- per-type code, e.g. "IN-Crockery-001" (not unique per item — matches existing data)
  image_url       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_item_master_inventory_type on item_master (inventory_type);
create index idx_item_master_department on item_master (department);

-- Source: Master-Dropdown [Issuer] column, deduped.
create table issuers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- Source: Master-Dropdown [Event-Type] column, deduped.
create table event_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- Source: Login sheet. Plain username/password + role, per explicit choice
-- (no hashing for now). Application-level auth, not Supabase Auth.
create table profiles (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  username    text not null unique,
  password    text not null,
  role        role_enum not null default 'user',
  deploy_link text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Transactional tables
-- ----------------------------------------------------------------------------

-- Source: Add-Stock + Re-Purchase sheets (identical columns, merged per
-- the user's choice — `source` distinguishes which sheet a row came from).
-- The sheets' "Opening Balance" column is really "quantity added this
-- transaction" — renamed to `qty` here for clarity.
create table stock_transactions (
  id          uuid primary key default gen_random_uuid(),
  source      stock_source_enum not null,
  serial_no   text,                                    -- original sheet Serial No, kept for traceability
  item_id     uuid not null references item_master (id),
  vendor_name text,
  qty         numeric(12, 2) not null default 0,
  unit        text,
  per_unit    numeric(12, 2) not null default 0,
  total_cost  numeric(14, 2) generated always as (qty * per_unit) stored,
  image_url   text,
  remarks     text,
  created_at  timestamptz not null default now()
);
create index idx_stock_transactions_item_id on stock_transactions (item_id);
create index idx_stock_transactions_created_at on stock_transactions (created_at);

-- Source: Issued sheet.
create table issues (
  id              uuid primary key default gen_random_uuid(),
  serial_no       text,
  item_id         uuid not null references item_master (id),
  party_name      text,
  event_date      date,
  issue_qty       numeric(12, 2) not null default 0,
  damage_rate     numeric(12, 2) not null default 0,
  renting_rate    numeric(12, 2) not null default 0,
  opening_balance numeric(12, 2),                       -- ledger snapshot at issue time (display only)
  closing_balance numeric(12, 2),                       -- opening_balance - issue_qty (temporary, not live stock)
  venue_name      text,
  image_url       text,
  remarks         text,
  event_type_id   uuid references event_types (id),
  estimated_cost  numeric(14, 2) generated always as (issue_qty * renting_rate) stored,
  for_type        for_type_enum,
  issuer_id       uuid references issuers (id),
  dishes          text,
  created_at      timestamptz not null default now()
);
create index idx_issues_item_id on issues (item_id);
create index idx_issues_event_date on issues (event_date);
create index idx_issues_party_name on issues (party_name);

-- Source: Return sheet. Linked back to the originating issue via serial_no
-- match (same pattern the Apps Script backend used) where resolvable.
create table returns (
  id              uuid primary key default gen_random_uuid(),
  serial_no       text,
  issue_id        uuid references issues (id),
  item_id         uuid not null references item_master (id),
  party_name      text,
  event_date      date,
  return_date     date,
  issue_qty       numeric(12, 2) not null default 0,
  return_qty      numeric(12, 2) not null default 0,
  damage_qty      numeric(12, 2) not null default 0,
  missing_qty     numeric(12, 2) not null default 0,
  damage_rate     numeric(12, 2) not null default 0,
  renting_rate    numeric(12, 2) not null default 0,
  opening_balance numeric(12, 2),
  closing_balance numeric(12, 2),
  total_balance   numeric(12, 2),
  image_url       text,
  remarks         text,
  total_cost      numeric(14, 2) generated always as
                     ((damage_qty + missing_qty) * damage_rate + return_qty * renting_rate) stored,
  for_type        for_type_enum,
  created_at      timestamptz not null default now()
);
create index idx_returns_item_id on returns (item_id);
create index idx_returns_issue_id on returns (issue_id);
create index idx_returns_event_date on returns (event_date);

-- ----------------------------------------------------------------------------
-- Live stock (INVENTORY sheet equivalent) — one row per item, maintained by
-- triggers, never written to directly by the app.
-- ----------------------------------------------------------------------------
create table inventory_current (
  item_id         uuid primary key references item_master (id),
  total_purchased numeric(14, 2) not null default 0,   -- sum of stock_transactions.qty
  total_issue     numeric(14, 2) not null default 0,   -- sum of issues.issue_qty (reporting only, doesn't affect stock)
  total_return    numeric(14, 2) not null default 0,   -- sum of returns.return_qty (reporting only)
  total_damage    numeric(14, 2) not null default 0,   -- sum of returns.damage_qty
  total_missing   numeric(14, 2) not null default 0,   -- sum of returns.missing_qty
  current_stock   numeric(14, 2) not null default 0,   -- total_purchased - total_damage - total_missing
  image_url       text,
  updated_at      timestamptz not null default now()
);

-- Source: History INVENTORY sheet — one snapshot row per item per day,
-- populated by a scheduled job (see 0002_functions_triggers.sql).
create table inventory_daily_snapshot (
  id              uuid primary key default gen_random_uuid(),
  snapshot_date   date not null,
  item_id         uuid not null references item_master (id),
  total_purchased numeric(14, 2) not null default 0,
  opening_balance numeric(14, 2) not null default 0,
  closing_balance numeric(14, 2) not null default 0,
  total_balance   numeric(14, 2) not null default 0,
  total_issue     numeric(14, 2) not null default 0,
  total_return    numeric(14, 2) not null default 0,
  total_damage    numeric(14, 2) not null default 0,
  total_missing   numeric(14, 2) not null default 0,
  created_at      timestamptz not null default now(),
  unique (snapshot_date, item_id)
);
create index idx_inventory_snapshot_date on inventory_daily_snapshot (snapshot_date);
create index idx_inventory_snapshot_item on inventory_daily_snapshot (item_id);
