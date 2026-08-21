import { supabase } from './supabaseClient';
import { compressImage } from './helpers';
import { STORAGE_BUCKETS, STORAGE_FOLDERS } from './dbSchema';

const BUCKET = STORAGE_BUCKETS.CROCKERY_IMAGE;

/**
 * Compresses (via helpers.compressImage) and uploads a File to the
 * `crockery-image` Supabase Storage bucket under the given folder prefix,
 * returning its public URL. Replaces the old Apps Script `uploadFile` ->
 * Google Drive flow.
 *
 * Only call this for a genuinely NEW photo. Re-Purchase/Issue/Return should
 * default to reusing the item's existing image_url instead of re-uploading
 * the same picture every time — see Stock.jsx/Inventory.jsx for the pattern.
 *
 * @param {File} file
 * @param {string} [folder] - one of STORAGE_FOLDERS; defaults to item-images
 * @returns {Promise<string>} public URL of the uploaded file
 */
export const uploadImage = async (file, folder = STORAGE_FOLDERS.ITEM_IMAGES) => {
  const compressed = await compressImage(file);
  const path = `${folder}/${Date.now()}_${compressed.name}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
    contentType: compressed.type,
    upsert: false
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
};
