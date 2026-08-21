-- ============================================================================
-- 0014_crockery_image_bucket.sql
--
-- Replaces the old 'item-images' bucket (never actually populated) with a
-- single 'crockery-image' bucket holding two logical folders via storage
-- path prefixes:
--   item-images/         — item photos (Master > Items, Stock Add/Re-Purchase)
--   issue-return-images/ — photos attached directly to an issue/return record
--
-- Storage usage reduction: Issue/Return/Re-Purchase forms default to REUSING
-- the item's existing image_url rather than uploading a new copy of the same
-- photo every time — a fresh upload only happens if the user explicitly
-- attaches a new file. See supabaseStorage.js / Inventory.jsx / Stock.jsx.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('crockery-image', 'crockery-image', true)
on conflict (id) do nothing;

create policy "crockery_image_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'crockery-image');

create policy "crockery_image_public_write" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'crockery-image');

create policy "crockery_image_public_update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'crockery-image');

create policy "crockery_image_public_delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'crockery-image');

-- Drop the old bucket's policies — confirmed empty (never had objects
-- uploaded). Supabase blocks direct `delete from storage.buckets` via SQL
-- (must go through the Storage API/dashboard instead) — the bucket row
-- itself is harmless to leave orphaned since nothing references it anymore.
drop policy if exists "item_images_public_read" on storage.objects;
drop policy if exists "item_images_public_write" on storage.objects;
drop policy if exists "item_images_public_update" on storage.objects;
drop policy if exists "item_images_public_delete" on storage.objects;
