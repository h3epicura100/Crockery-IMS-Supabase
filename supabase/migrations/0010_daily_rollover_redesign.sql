-- ============================================================================
-- 0010_daily_rollover_redesign.sql
--
-- Reworks inventory_current from a lifetime-cumulative row into a "today's
-- working row" per item — reproducing how the original sheets actually
-- worked (History INVENTORY = per-day ledger with running opening/closing
-- balance; INVENTORY = a live formula view of "today").
--
-- inventory_current columns after this migration:
--   opening_balance  — carried forward from yesterday's snapshot closing;
--                       only ever changed by rollover_day(), fixed all day
--   total_purchased/total_issue/total_return/total_damage/total_missing
--                    — TODAY's activity only (date-scoped sums, naturally
--                       reset to 0 once the date rolls over — see below)
--   current_stock    — live: opening_balance + total_purchased -
--                       total_damage - total_missing, recalculated instantly
--                       by the existing triggers on every relevant insert
--   closing_balance  — NULL all day; frozen to current_stock once, at 23:00
--                       IST, by close_day()
--
-- Two new scheduled jobs (both Asia/Kolkata, pg_cron runs in UTC):
--   23:00 IST (17:30 UTC) close_day()    — freeze closing_balance for every
--                                           item, upsert ALL items (active or
--                                           not) into inventory_daily_snapshot
--   00:00 IST (18:30 UTC) rollover_day() — opening_balance := yesterday's
--                                           snapshot closing; today's sums
--                                           naturally zero out because
--                                           recalc_inventory_current always
--                                           filters to "today" — plus a
--                                           gap-fill safety net in case a
--                                           close_day() run was ever missed.
-- ============================================================================

alter table inventory_current add column opening_balance numeric(14, 2) not null default 0;
alter table inventory_current add column closing_balance numeric(14, 2);

-- Seed opening_balance from the current (pre-redesign) lifetime current_stock
-- BEFORE the recalc function below switches to today-scoped semantics, so
-- existing stock levels carry over unchanged through this migration.
update inventory_current set opening_balance = current_stock;

-- ----------------------------------------------------------------------------
-- recalc_inventory_current — now scoped to "today" (Asia/Kolkata) only.
-- opening_balance is deliberately NOT touched here (only rollover_day() sets
-- it) — that's what keeps it fixed for the whole day while today's activity
-- sums keep recalculating live.
-- ----------------------------------------------------------------------------
create or replace function recalc_inventory_current(p_item_id uuid)
returns void
language plpgsql
as $$
declare
  v_today           date := (now() at time zone 'Asia/Kolkata')::date;
  v_opening         numeric(14, 2);
  v_total_purchased numeric(14, 2);
  v_total_issue     numeric(14, 2);
  v_total_return    numeric(14, 2);
  v_total_damage    numeric(14, 2);
  v_total_missing   numeric(14, 2);
  v_image_url       text;
begin
  select coalesce(opening_balance, 0) into v_opening
  from inventory_current where item_id = p_item_id;
  v_opening := coalesce(v_opening, 0);

  select coalesce(sum(qty), 0) into v_total_purchased
  from stock_transactions
  where item_id = p_item_id and (created_at at time zone 'Asia/Kolkata')::date = v_today;

  select coalesce(sum(issue_qty), 0) into v_total_issue
  from issues
  where item_id = p_item_id and (created_at at time zone 'Asia/Kolkata')::date = v_today;

  select coalesce(sum(return_qty), 0), coalesce(sum(damage_qty), 0), coalesce(sum(missing_qty), 0)
  into v_total_return, v_total_damage, v_total_missing
  from returns
  where item_id = p_item_id and (created_at at time zone 'Asia/Kolkata')::date = v_today;

  select coalesce(im.image_url, (
    select st.image_url from stock_transactions st
    where st.item_id = p_item_id and st.image_url is not null
    order by st.created_at desc limit 1
  ))
  into v_image_url
  from item_master im where im.id = p_item_id;

  insert into inventory_current as ic (
    item_id, opening_balance, total_purchased, total_issue, total_return,
    total_damage, total_missing, current_stock, image_url, updated_at
  )
  values (
    p_item_id, v_opening, v_total_purchased, v_total_issue, v_total_return,
    v_total_damage, v_total_missing,
    v_opening + v_total_purchased - v_total_damage - v_total_missing,
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
    -- opening_balance / closing_balance intentionally absent from this
    -- update list — only rollover_day() / close_day() touch those.
end;
$$;

-- Refresh every item now that the function above is date-scoped — backfilled
-- historical transactions are all dated in the past, so this correctly zeroes
-- today's activity sums while current_stock stays == opening_balance (the
-- value we just seeded), confirming continuity.
select recalc_inventory_current(item_id) from inventory_current;

-- ----------------------------------------------------------------------------
-- close_day() — 23:00 IST. Freezes today's closing balance and archives
-- EVERY item (active or not) into inventory_daily_snapshot.
-- ----------------------------------------------------------------------------
create or replace function close_day()
returns void
language plpgsql
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  update inventory_current set closing_balance = current_stock;

  insert into inventory_daily_snapshot (
    snapshot_date, item_id, total_purchased, opening_balance,
    closing_balance, total_balance, total_issue, total_return,
    total_damage, total_missing
  )
  select
    v_today, ic.item_id, ic.total_purchased, ic.opening_balance,
    ic.closing_balance, ic.closing_balance, ic.total_issue, ic.total_return,
    ic.total_damage, ic.total_missing
  from inventory_current ic
  on conflict (snapshot_date, item_id) do update set
    total_purchased = excluded.total_purchased,
    opening_balance = excluded.opening_balance,
    closing_balance = excluded.closing_balance,
    total_balance   = excluded.total_balance,
    total_issue     = excluded.total_issue,
    total_return    = excluded.total_return,
    total_damage    = excluded.total_damage,
    total_missing   = excluded.total_missing;
end;
$$;

-- ----------------------------------------------------------------------------
-- rollover_day() — 00:00 IST. Carries yesterday's closing balance forward as
-- today's opening balance for every item, then refreshes today's activity
-- sums (which naturally zero out via the date filter in recalc above).
--
-- Gap-fill safety net: if close_day() ever failed to run for one or more
-- days (cron/DB downtime), an item's most recent snapshot could be older
-- than yesterday. Rather than leave a silent hole in History, this backfills
-- one snapshot row per skipped day, carrying the last known closing_balance
-- forward with zero activity — so inventory_daily_snapshot never has a gap,
-- per the requirement that every item appears every day regardless of
-- activity.
-- ----------------------------------------------------------------------------
create or replace function rollover_day()
returns void
language plpgsql
as $$
declare
  v_yesterday date := ((now() at time zone 'Asia/Kolkata')::date) - 1;
  r           record;
  v_gap_date  date;
  v_last_snap inventory_daily_snapshot%rowtype;
begin
  -- Gap-fill pass: only touches items whose latest snapshot is older than
  -- yesterday (i.e. a close_day() run was missed for one or more days).
  for r in
    select im.id as item_id, max(s.snapshot_date) as last_date
    from item_master im
    left join inventory_daily_snapshot s on s.item_id = im.id
    group by im.id
    having max(s.snapshot_date) < v_yesterday or max(s.snapshot_date) is null
  loop
    if r.last_date is null then
      continue; -- brand new item, never snapshotted yet — nothing to carry forward
    end if;

    select * into v_last_snap from inventory_daily_snapshot
    where item_id = r.item_id and snapshot_date = r.last_date;

    v_gap_date := r.last_date + 1;
    while v_gap_date <= v_yesterday loop
      insert into inventory_daily_snapshot (
        snapshot_date, item_id, total_purchased, opening_balance,
        closing_balance, total_balance, total_issue, total_return,
        total_damage, total_missing
      ) values (
        v_gap_date, r.item_id, 0, v_last_snap.closing_balance,
        v_last_snap.closing_balance, v_last_snap.closing_balance, 0, 0, 0, 0
      )
      on conflict (snapshot_date, item_id) do nothing;
      v_gap_date := v_gap_date + 1;
    end loop;
  end loop;

  -- Roll every item forward: opening_balance := yesterday's closing balance
  -- (now guaranteed to exist thanks to the gap-fill pass above).
  update inventory_current ic
  set opening_balance = s.closing_balance,
      closing_balance = null
  from inventory_daily_snapshot s
  where s.item_id = ic.item_id and s.snapshot_date = v_yesterday;

  perform recalc_inventory_current(item_id) from inventory_current;
end;
$$;

-- Replace the old single "copy inventory_current as-is" cron job with the
-- close/rollover pair.
select cron.unschedule('daily-inventory-snapshot');

select cron.schedule('close-day', '30 17 * * *', $$select close_day();$$);     -- 23:00 IST
select cron.schedule('rollover-day', '30 18 * * *', $$select rollover_day();$$); -- 00:00 IST

-- snapshot_inventory_daily() from 0002 is now superseded by close_day() /
-- rollover_day() — dropped to avoid two divergent ways of populating the
-- same table.
drop function if exists snapshot_inventory_daily();
