/**
 * Formats a date string from various formats into DD-MM-YYYY for display.
 */
export const formatDate = (dateStr) => {
  if (!dateStr || dateStr === "undefined" || dateStr === "null") return "-";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      // Fallback for non-standard formats like DD/MM/YYYY
      if (typeof dateStr === 'string' && dateStr.includes('/')) {
        const parts = dateStr.split(',')[0].split('/');
        if (parts.length === 3) {
          return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
        }
      }
      return String(dateStr);
    }
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
  } catch {
    return String(dateStr);
  }
};

/**
 * Formats a date string into DD-MM-YYYY HH:mm:ss for backend sumbissions.
 */
export const formatDateTime = (dateStr) => {
  if (!dateStr || dateStr === "undefined" || dateStr === "null") return "-";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return String(dateStr);
    }
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${d}-${m}-${y} ${hh}:${mm}:${ss}`;
  } catch {
    return String(dateStr);
  }
};

/**
 * Parses a date string from sheet row data (DD/MM/YYYY, DD-MM-YYYY, or ISO) into a Date object.
 * Used for date-range filter comparisons. Returns null if unparseable.
 */
export const parseRowDate = (dStr) => {
  if (!dStr) return null;
  try {
    const str = String(dStr).trim();
    // ISO format: YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str);
    // DD/MM/YYYY or DD-MM-YYYY (take date part before any space)
    const datePart = str.split(' ')[0];
    const sep = datePart.includes('/') ? '/' : '-';
    const parts = datePart.split(sep);
    if (parts.length === 3) {
      if (parts[0].length === 4) return new Date(str); // already YYYY-MM-DD form
      const [d, m, y] = parts;
      const date = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  } catch { return null; }
};
/**
 * Parses a number from sheet data, handling commas, currency symbols, and empty strings.
 * Returns 0 if unparseable or empty.
 */
export const parseNumber = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  try {
    const cleaned = String(val).replace(/[$,\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  } catch { return 0; }
};

/**
 * Formats a date string into YYYY-MM-DD for HTML5 date inputs.
 */
export const toInputDate = (val) => {
  if (!val || val === "undefined" || val === "null") return '';
  try {
    const date = new Date(val);
    if (isNaN(date.getTime())) {
      // Manual parsing for DD/MM/YYYY
      const s = String(val).trim();
      const parts = s.split(/[-/]/);
      if (parts.length >= 3) {
        if (parts[0].length === 4) return s.substring(0, 10); // Already YYYY-MM-DD
        const d = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        let y = parts[2].split(/[ ,]/)[0];
        if (y.length === 2) y = `20${y}`;
        return `${y}-${m}-${d}`;
      }
      return '';
    }
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return '';
  }
};

/**
 * Compresses an image file client-side before upload.
 * Reduces dimensions and quality to save bandwidth and prevent timeouts.
 */
export const compressImage = (file, maxWidth = 1000, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (!blob) return resolve(file);
          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(compressedFile);
        }, 'image/jpeg', quality);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

/**
 * Formats a number according to the Indian numbering system with abbreviations.
 * e.g., 1,000 -> 1k, 1,00,000 -> 1L, 1,00,00,000 -> 1Cr.
 */
export const formatIndianAmount = (num) => {
  if (num === undefined || num === null || isNaN(num)) return "0";
  const val = Math.abs(num);
  if (val >= 10000000) return (num / 10000000).toFixed(2) + " Cr";
  if (val >= 100000) return (num / 100000).toFixed(2) + " L";
  if (val >= 1000) return (num / 1000).toFixed(2) + " k";
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Trims leading/trailing spaces and collapses internal multiple spaces into one.
 * e.g., "   hello    world   " -> "hello world"
 */
export const cleanText = (val) => {
  if (typeof val !== 'string') return val;
  return val.trim().replace(/\s+/g, ' ');
};

/**
 * Normalizes a string for loose comparison (lowercase and no spaces).
 */
export const normalizeForMatch = (val) => {
  if (!val) return '';
  return String(val).toLowerCase().replace(/\s+/g, '');
};
