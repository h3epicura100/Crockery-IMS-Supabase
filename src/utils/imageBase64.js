/**
 * Fetches an image URL and converts it to a compact base64 data URL, for embedding
 * into a jsPDF document. Works directly for Supabase Storage public URLs and fallbacks.
 *
 * Resizes images to a maximum dimension of 128px and converts to JPEG (0.8 quality)
 * with a white background to avoid "Invalid string length" crashes and keep memory low.
 */
export const loadImageAsBase64 = (url, timeoutMs = 6000) => {
  if (!url || url === 'No Image') return Promise.resolve(null);

  return new Promise((resolve) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        resolve(null);
      }
    }, timeoutMs);

    const done = (val) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve(val);
      }
    };

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const maxDim = 128;
        const origW = img.naturalWidth || img.width || 100;
        const origH = img.naturalHeight || img.height || 100;
        const scale = Math.min(1, maxDim / Math.max(origW, origH, 1));
        const targetW = Math.max(1, Math.round(origW * scale));
        const targetH = Math.max(1, Math.round(origH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          done(null);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        done(dataUrl);
      } catch {
        fetchFallback(url).then(done);
      }
    };
    img.onerror = () => {
      fetchFallback(url).then(done);
    };
    img.src = url;
  });
};

const fetchFallback = async (url) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        try {
          const maxDim = 128;
          const origW = img.naturalWidth || img.width || 100;
          const origH = img.naturalHeight || img.height || 100;
          const scale = Math.min(1, maxDim / Math.max(origW, origH, 1));
          const targetW = Math.max(1, Math.round(origW * scale));
          const targetH = Math.max(1, Math.round(origH * scale));

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        resolve(null);
      };
      img.src = blobUrl;
    });
  } catch {
    return null;
  }
};

/**
 * Loads a list of image URLs in small batches to avoid blocking the event loop
 * and saturating network/memory. Returns a map of { [url]: base64DataUrl }.
 */
export const loadImagesBatched = async (urls, batchSize = 10) => {
  if (!urls || urls.length === 0) return {};
  const uniqueUrls = [...new Set(urls.filter(Boolean))].filter(u => u !== 'No Image');
  const imageMap = {};

  for (let i = 0; i < uniqueUrls.length; i += batchSize) {
    const batch = uniqueUrls.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (url) => {
        try {
          const b64 = await loadImageAsBase64(url);
          return { url, b64 };
        } catch {
          return { url, b64: null };
        }
      })
    );

    results.forEach(({ url, b64 }) => {
      if (b64) imageMap[url] = b64;
    });

    // Yield to the browser to keep UI responsive and allow render cycles
    await new Promise((resolve) => setTimeout(resolve, 15));
  }

  return imageMap;
};

