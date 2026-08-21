-- ============================================================================
-- 0012_storage_bucket.sql
--
-- Public storage bucket for item/stock/issue/return images, replacing Google
-- Drive uploads (which went through the Apps Script `uploadFile` action,
-- being removed as part of the full cutover). Public + permissive policies,
-- matching this project's existing trust model (see 0004_rls.sql).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', true)
on conflict (id) do nothing;

create policy "item_images_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'item-images');

create policy "item_images_public_write" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'item-images');

create policy "item_images_public_update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'item-images');

create policy "item_images_public_delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'item-images');
