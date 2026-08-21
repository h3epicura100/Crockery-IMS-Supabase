/**
 * Fetches an image URL and converts it to a base64 data URL, for embedding
 * into a jsPDF document. Works directly (no proxy) for Supabase Storage
 * public URLs, which set permissive CORS headers. Replaces the old
 * Apps Script `getImageBase64` action used when images lived on Drive.
 *
 * Legacy Drive-hosted image URLs (from before the Supabase cutover) may fail
 * here due to Drive's CORS policy — callers already treat a null return as
 * "skip this image", so a PDF just omits that one image rather than failing.
 */
export const loadImageAsBase64 = async (url) => {
  if (!url || url === 'No Image') return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};
