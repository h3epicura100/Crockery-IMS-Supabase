const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const Papa = require('papaparse');

const SUPABASE_URL = 'https://hfvbyktusslocxsblenu.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdmJ5a3R1c3Nsb2N4c2JsZW51Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzE5OTM4NSwiZXhwIjoyMTAyNzc1Mzg1fQ.f1t-aMATbAuvDBaLufC6J8g-1HcP3EOo2rmmf5bofc4';
const BUCKET = 'crockery-image';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

function findCsvPath() {
  const possiblePaths = [
    path.join(__dirname, 'Inventory_sheet.csv'),
    path.join(__dirname, 'inventory_sheet.csv')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Could not find Inventory_sheet.csv');
}

function extractDriveFileId(url) {
  if (!url) return null;
  const match = url.match(/(?:id=|\/d\/)([a-zA-Z0-9\-_]{25,})/);
  return match ? match[1] : null;
}

async function downloadDriveImage(fileId) {
  const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
  try {
    let res = await fetch(thumbUrl);
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length > 500) return buffer;
    }
  } catch (e) {}

  const exportUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const res = await fetch(exportUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching Drive image ${fileId}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Clean string for loose matching (collapses spaces, removes hyphens & special characters)
function normalizeName(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function runSimilarMigration() {
  console.log('🚀 Running Space-Normalized & Similar Name Image Migration...');

  const csvPath = findCsvPath();
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  // Load all item_master rows
  const { data: dbItems, error } = await supabase
    .from('item_master')
    .select('id, item_name, image_url');

  if (error) {
    console.error('❌ Error fetching item_master:', error.message);
    process.exit(1);
  }

  // Filter ONLY items with empty/null/No Image image_url (do not touch items with existing images!)
  const emptyDbItems = dbItems.filter(i => !i.image_url || i.image_url.trim() === '' || i.image_url === 'No Image');
  console.log(`📦 DB Total Items: ${dbItems.length} | Items without images: ${emptyDbItems.length}`);

  // Build map of normalized DB item names
  const dbNormalizedMap = new Map();
  emptyDbItems.forEach(item => {
    const norm = normalizeName(item.item_name);
    if (norm) dbNormalizedMap.set(norm, item);
  });

  // Manual explicit mapping overrides for subtle typos between sheet and DB
  const manualTypoMap = {
    'barbecue tray': 'barbeque tray',
    'cs-021 ad': 'cs-21 ad',
    'golden kadhai': 'golden kadai',
    'mbp-29': 'mbp-29 gg',
    'mbp-30': 'mbp-30  gg',
    'mbp-31': 'mbp-31  gg',
    'monkey bowl': 'monkey bowl  bc',
    'noodles tong': 'noodels tong',
    'orange plate': 'orage plate',
    'single bhatti corner': 'single bhatti cover',
    'straw': 'strew',
    'two self rack with hurts': 'two self rack with hurt',
    'yellow bowl': 'yellow bowll'
  };

  // Build DB map for manual typo lookup
  const dbLowerMap = new Map();
  emptyDbItems.forEach(item => {
    dbLowerMap.set(item.item_name.trim().toLowerCase(), item);
  });

  let stats = {
    matched: 0,
    uploaded: 0,
    errors: 0
  };

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const sheetName = (row['Items Name'] || '').trim();
    const driveUrl = (row['Image'] || '').trim();

    if (!sheetName || !driveUrl || driveUrl === 'No Image' || driveUrl === '-') continue;

    const fileId = extractDriveFileId(driveUrl);
    if (!fileId) continue;

    const sheetLower = sheetName.toLowerCase();
    const sheetNorm = normalizeName(sheetName);

    // Check if sheet item matches any empty DB item (via normalized name or manual typo map)
    let targetDbItem = dbNormalizedMap.get(sheetNorm);

    if (!targetDbItem && manualTypoMap[sheetLower]) {
      const targetName = manualTypoMap[sheetLower];
      targetDbItem = dbLowerMap.get(targetName);
    }

    if (!targetDbItem) continue;

    // Double check safeguard: verify this targetDbItem DOES NOT already have an image_url
    if (targetDbItem.image_url && targetDbItem.image_url.includes('supabase.co/storage')) {
      console.log(`🔒 Skipping "${targetDbItem.item_name}" - already has an image link.`);
      continue;
    }

    stats.matched++;
    console.log(`✨ [Match ${stats.matched}] Sheet ["${sheetName}"] => DB ["${targetDbItem.item_name}"] (ID: ${fileId})`);

    try {
      console.log(`⏳ Downloading image for "${targetDbItem.item_name}"...`);
      const imageBuffer = await downloadDriveImage(fileId);

      const storagePath = `item-images/${Date.now()}_${fileId}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, imageBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadErr) throw new Error(`Upload error: ${uploadErr.message}`);

      const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;

      // Update item_master
      const { error: updateErr } = await supabase
        .from('item_master')
        .update({ image_url: publicUrl })
        .eq('id', targetDbItem.id);

      if (updateErr) throw new Error(`DB update error: ${updateErr.message}`);

      // Also update inventory_current
      await supabase
        .from('inventory_current')
        .update({ image_url: publicUrl })
        .eq('item_id', targetDbItem.id);

      console.log(`✅ Updated "${targetDbItem.item_name}" with image URL: ${publicUrl}`);
      stats.uploaded++;

      // Prevent rate limit
      await new Promise(r => setTimeout(r, 100));

    } catch (err) {
      console.error(`❌ Error updating "${targetDbItem.item_name}":`, err.message);
      stats.errors++;
    }
  }

  console.log('\n=========================================');
  console.log('🎉 Similar Items Migration Finished!');
  console.log(`Matches Found: ${stats.matched}`);
  console.log(`✅ Images Uploaded & DB Updated: ${stats.uploaded}`);
  console.log(`❌ Errors: ${stats.errors}`);
  console.log('=========================================\n');
}

runSimilarMigration().catch(err => {
  console.error('Fatal Failure:', err);
  process.exit(1);
});
