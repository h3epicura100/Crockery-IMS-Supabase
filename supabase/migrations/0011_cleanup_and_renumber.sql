-- ============================================================================
-- 0011_cleanup_and_renumber.sql
--
-- 1. Drop returns.issue_id (always NULL — no reliable way to link legacy
--    return rows to their issue, per the earlier serial_no investigation;
--    unused going forward too since nothing sets it).
-- 2. Make inventory_current.current_stock a GENERATED column instead of a
--    manually-synced one — it's fully derivable from the other three
--    columns, so this removes an entire class of "forgot to update it"
--    bugs while keeping it a fast, directly-readable column.
-- 3. Rename profiles -> login.
-- 4. Renumber existing (pre-scheme) serial_no values on issues/returns/
--    stock_transactions to the new IS-/RT-/AS-/RP- prefixes, in chronological
--    order, then advance each sequence so new inserts continue right after
--    the last renumbered row (no collisions).
-- ============================================================================

-- ---- 1. drop returns.issue_id -----------------------------------------------
alter table returns drop column issue_id;

-- ---- 2. current_stock becomes a generated column ---------------------------
alter table inventory_current drop column current_stock;
alter table inventory_current
  add column current_stock numeric(14, 2)
  generated always as (opening_balance + total_purchased - total_damage - total_missing) stored;

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

  -- current_stock is intentionally absent from both the column list and the
  -- values/update below — it's a GENERATED column now, Postgres computes it.
  insert into inventory_current as ic (
    item_id, opening_balance, total_purchased, total_issue, total_return,
    total_damage, total_missing, image_url, updated_at
  )
  values (
    p_item_id, v_opening, v_total_purchased, v_total_issue, v_total_return,
    v_total_damage, v_total_missing, v_image_url, now()
  )
  on conflict (item_id) do update set
    total_purchased = excluded.total_purchased,
    total_issue     = excluded.total_issue,
    total_return    = excluded.total_return,
    total_damage    = excluded.total_damage,
    total_missing   = excluded.total_missing,
    image_url       = excluded.image_url,
    updated_at      = now();
end;
$$;

-- ---- 3. rename profiles -> login -------------------------------------------
alter table profiles rename to login;
alter policy profiles_open_policy on login rename to login_open_policy;

-- ---- 4. renumber existing serials to the new prefix scheme -----------------
-- Chronological order preserves the original sequence of events; each table
-- gets its own counter (stock_transactions numbered separately PER SOURCE,
-- since add_stock and re_purchase each have their own AS-/RP- counter).
with ordered as (
  select id, row_number() over (order by created_at, id) as rn from issues
)
update issues i set serial_no = 'IS-' || lpad(o.rn::text, 3, '0')
from ordered o where o.id = i.id;

with ordered as (
  select id, row_number() over (order by created_at, id) as rn from returns
)
update returns r set serial_no = 'RT-' || lpad(o.rn::text, 3, '0')
from ordered o where o.id = r.id;

with ordered as (
  select id, source, row_number() over (partition by source order by created_at, id) as rn
  from stock_transactions
)
update stock_transactions st set serial_no = case
    when o.source = 'add_stock' then 'AS-' || lpad(o.rn::text, 3, '0')
    else 'RP-' || lpad(o.rn::text, 3, '0')
  end
from ordered o where o.id = st.id;

-- Advance each sequence past the last renumbered row so the next new insert
-- continues seamlessly (e.g. if 188 issues were just renumbered IS-001..IS-188,
-- the next new issue gets IS-189, not a collision back at IS-001).
select setval('issue_serial_seq', (select count(*) from issues));
select setval('return_serial_seq', (select count(*) from returns));
select setval('stock_add_serial_seq', (select count(*) from stock_transactions where source = 'add_stock'));
select setval('stock_repurchase_serial_seq', (select count(*) from stock_transactions where source = 're_purchase'));
