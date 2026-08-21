-- ============================================================================
-- 0002_functions_triggers.sql
--
-- Maintains inventory_current automatically and populates the daily history
-- snapshot. Implements the rule: live stock changes ONLY on stock additions,
-- re-purchases, or damage/missing recorded on a return.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- recalc_inventory_current(item_id)
-- Recomputes one item's row in inventory_current from source tables.
-- Called by triggers below whenever a relevant row is inserted/updated/deleted.
-- current_stock intentionally only derives from total_purchased/total_damage/
-- total_missing — total_issue/total_return are tracked for reporting only and
-- never feed into current_stock, per the business rule.
-- ----------------------------------------------------------------------------
create or replace function recalc_inventory_current(p_item_id uuid)
returns void
language plpgsql
as $$
declare
  v_total_purchased numeric(14, 2);
  v_total_issue     numeric(14, 2);
  v_total_return    numeric(14, 2);
  v_total_damage    numeric(14, 2);
  v_total_missing   numeric(14, 2);
  v_image_url       text;
begin
  select coalesce(sum(qty), 0) into v_total_purchased
  from stock_transactions where item_id = p_item_id;

  select coalesce(sum(issue_qty), 0) into v_total_issue
  from issues where item_id = p_item_id;

  select coalesce(sum(return_qty), 0), coalesce(sum(damage_qty), 0), coalesce(sum(missing_qty), 0)
  into v_total_return, v_total_damage, v_total_missing
  from returns where item_id = p_item_id;

  select coalesce(im.image_url, (
    select st.image_url from stock_transactions st
    where st.item_id = p_item_id and st.image_url is not null
    order by st.created_at desc limit 1
  ))
  into v_image_url
  from item_master im where im.id = p_item_id;

  insert into inventory_current as ic (
    item_id, total_purchased, total_issue, total_return,
    total_damage, total_missing, current_stock, image_url, updated_at
  )
  values (
    p_item_id, v_total_purchased, v_total_issue, v_total_return,
    v_total_damage, v_total_missing,
    v_total_purchased - v_total_damage - v_total_missing,
    v_image_url, now()
  )
  on conflict (item_id) do update set
    total_purchased = excluded.total_purchased,
    total_issue     = excluded.total_issue,
    total_return    = excluded.total_return,
    total_damage    = excluded.total_damage,
    total_missing   = excluded.total_missing,
    current_stock   = excluded.current_stock,
    image_url       = excluded.image_url,
    updated_at      = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- Generic trigger function: recalcs inventory_current for whichever item_id
-- the firing row (NEW on insert/update, OLD on delete) belongs to. Handles
-- the case where item_id itself changes on update by recalculating both.
-- ----------------------------------------------------------------------------
create or replace function trg_recalc_inventory_current()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform recalc_inventory_current(old.item_id);
    return old;
  end if;

  perform recalc_inventory_current(new.item_id);
  if tg_op = 'UPDATE' and old.item_id is distinct from new.item_id then
    perform recalc_inventory_current(old.item_id);
  end if;
  return new;
end;
$$;

create trigger trg_stock_transactions_recalc
  after insert or update or delete on stock_transactions
  for each row execute function trg_recalc_inventory_current();

create trigger trg_issues_recalc
  after insert or update or delete on issues
  for each row execute function trg_recalc_inventory_current();

create trigger trg_returns_recalc
  after insert or update or delete on returns
  for each row execute function trg_recalc_inventory_current();

-- New item_master rows should get an inventory_current row immediately
-- (all zeros) so joins/reporting never have to special-case a missing row.
create or replace function trg_item_master_seed_inventory()
returns trigger
language plpgsql
as $$
begin
  insert into inventory_current (item_id, image_url)
  values (new.id, new.image_url)
  on conflict (item_id) do nothing;
  return new;
end;
$$;

create trigger trg_item_master_seed
  after insert on item_master
  for each row execute function trg_item_master_seed_inventory();

-- ----------------------------------------------------------------------------
-- Daily snapshot job (History INVENTORY equivalent)
-- Records the current state of every item as of "today" (Asia/Kolkata).
-- Safe to re-run for the same day (upserts on the snapshot_date/item_id
-- unique constraint) in case the cron fires more than once.
-- ----------------------------------------------------------------------------
create or replace function snapshot_inventory_daily()
returns void
language plpgsql
as $$
begin
  insert into inventory_daily_snapshot (
    snapshot_date, item_id, total_purchased, opening_balance,
    closing_balance, total_balance, total_issue, total_return,
    total_damage, total_missing
  )
  select
    (now() at time zone 'Asia/Kolkata')::date,
    ic.item_id,
    ic.total_purchased,
    ic.current_stock,   -- opening/closing/total are all the same running figure, matching current sheet behavior
    ic.current_stock,
    ic.current_stock,
    ic.total_issue,
    ic.total_return,
    ic.total_damage,
    ic.total_missing
  from inventory_current ic
  on conflict (snapshot_date, item_id) do update set
    total_purchased = excluded.total_purchased,
    opening_balance  = excluded.opening_balance,
    closing_balance  = excluded.closing_balance,
    total_balance    = excluded.total_balance,
    total_issue      = excluded.total_issue,
    total_return     = excluded.total_return,
    total_damage     = excluded.total_damage,
    total_missing    = excluded.total_missing;
end;
$$;

-- Schedule: 00:00 Asia/Kolkata daily == 18:30 UTC (pg_cron always runs in UTC).
-- Requires the pg_cron extension — enabled in 0003_cron.sql, kept separate
-- because on some Supabase projects it must be turned on via the dashboard
-- (Database -> Extensions) before this will succeed.
