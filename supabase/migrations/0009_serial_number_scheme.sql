-- ============================================================================
-- 0009_serial_number_scheme.sql
--
-- Prefixed, sequence-backed serial numbers, generated once at insert time by
-- a BEFORE INSERT trigger (authoritative — no race condition, since nextval()
-- is atomic and only ever called from inside the trigger, never previewed
-- and re-requested from the frontend). serial_no is a human-facing display
-- label only; every real relationship (edits, deletes, joins) already uses
-- the uuid `id` column, so renumbering here has zero effect on integrity.
--
-- Prefixes: IS- issues, RT- returns, AS- stock_transactions(add_stock),
-- RP- stock_transactions(re_purchase) — separate prefixes for Add-Stock vs
-- Re-Purchase even though they share one table, so a raw serial number
-- alone identifies the transaction type without checking `source`.
--
-- 3-digit zero-padding (IS-001), matching the old sheet's SN-001 style.
-- Existing backfilled rows already have their original sheet serial (e.g.
-- "SN-002") preserved as-is; this scheme only applies to NEW inserts from
-- here on (the trigger only fires when serial_no is NULL).
-- ============================================================================

create sequence issue_serial_seq;
create sequence return_serial_seq;
create sequence stock_add_serial_seq;
create sequence stock_repurchase_serial_seq;

create function get_next_issue_num() returns text
language sql as $$
  select 'IS-' || lpad(nextval('issue_serial_seq')::text, 3, '0');
$$;

create function get_next_return_num() returns text
language sql as $$
  select 'RT-' || lpad(nextval('return_serial_seq')::text, 3, '0');
$$;

create function get_next_stock_add_num() returns text
language sql as $$
  select 'AS-' || lpad(nextval('stock_add_serial_seq')::text, 3, '0');
$$;

create function get_next_repurchase_num() returns text
language sql as $$
  select 'RP-' || lpad(nextval('stock_repurchase_serial_seq')::text, 3, '0');
$$;

create or replace function trg_assign_issue_serial() returns trigger
language plpgsql as $$
begin
  if new.serial_no is null then
    new.serial_no := get_next_issue_num();
  end if;
  return new;
end;
$$;
create trigger trg_issues_serial before insert on issues
  for each row execute function trg_assign_issue_serial();

create or replace function trg_assign_return_serial() returns trigger
language plpgsql as $$
begin
  if new.serial_no is null then
    new.serial_no := get_next_return_num();
  end if;
  return new;
end;
$$;
create trigger trg_returns_serial before insert on returns
  for each row execute function trg_assign_return_serial();

create or replace function trg_assign_stock_serial() returns trigger
language plpgsql as $$
begin
  if new.serial_no is null then
    if new.source = 'add_stock' then
      new.serial_no := get_next_stock_add_num();
    else
      new.serial_no := get_next_repurchase_num();
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_stock_transactions_serial before insert on stock_transactions
  for each row execute function trg_assign_stock_serial();
