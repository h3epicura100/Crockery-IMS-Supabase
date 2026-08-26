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

// Locate CSV file
function findCsvPath() {
  const possiblePaths = [
    path.join(__dirname, 'Inventory_sheet.csv'),
    path.join(__dirname, 'inventory_sheet.csv'),
    path.join(__dirname, '../Inventory_sheet.csv')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Could not find Inventory_sheet.csv in scripts/ directory');
}

// Extract Drive File ID
function extractDriveFileId(url) {
  if (!url) return null;
  const match = url.match(/(?:id=|\/d\/)([a-zA-Z0-9\-_]{25,})/);
  return match ? match[1] : null;
}

// Download image from Google Drive
async function downloadDriveImage(fileId) {
  // Try thumbnail endpoint first (fastest and most reliable for images)
  const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
  try {
    let res = await fetch(thumbUrl);
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length > 500) return buffer;
    }
  } catch (e) {
    // fallback below
  }

  // Fallback to export download link
  const exportUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const res = await fetch(exportUrl);
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status} fetching Drive image ${fileId}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function runMigration() {
  console.log('🚀 Starting Item Image Migration (Drive -> Supabase Storage)...');

  // 1. Load CSV
  const csvPath = findCsvPath();
  console.log(`📄 Reading CSV from: ${csvPath}`);
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  console.log(`📊 Found ${parsed.data.length} rows in CSV.`);

  // 2. Fetch all DB items from item_master
  console.log('📦 Fetching item_master catalog from Supabase...');
  const { data: dbItems, error: dbErr } = await supabase
    .from('item_master')
    .select('id, item_name, image_url');

  if (dbErr) {
    console.error('❌ Error fetching item_master:', dbErr.message);
    process.exit(1);
  }

  console.log(`✅ Loaded ${dbItems.length} items from item_master.`);

  // Build lookup maps
  const exactMap = new Map();
  const lowerMap = new Map();
  dbItems.forEach(item => {
    const trimmed = item.item_name.trim();
    exactMap.set(trimmed, item);
    lowerMap.set(trimmed.toLowerCase(), item);
  });

  let stats = {
    total: parsed.data.length,
    processed: 0,
    uploaded: 0,
    skippedNoUrl: 0,
    skippedNoMatch: 0,
    errors: 0
  };

  // 3. Process each row
  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const sheetName = (row['Items Name'] || row['items_name'] || '').trim();
    const driveUrl = (row['Image'] || row['image_url'] || '').trim();

    if (!sheetName) continue;

    stats.processed++;

    if (!driveUrl || driveUrl === 'No Image' || driveUrl === '-') {
      stats.skippedNoUrl++;
      continue;
    }

    const fileId = extractDriveFileId(driveUrl);
    if (!fileId) {
      console.log(`⚠️  [${i + 1}/${parsed.data.length}] Invalid Drive URL for "${sheetName}": ${driveUrl}`);
      stats.skippedNoUrl++;
      continue;
    }

    // Match DB item
    const dbItem = exactMap.get(sheetName) || lowerMap.get(sheetName.toLowerCase());
    if (!dbItem) {
      console.log(`❌ [${i + 1}/${parsed.data.length}] No DB match found for sheet item: "${sheetName}"`);
      stats.skippedNoMatch++;
      continue;
    }

    try {
      console.log(`⏳ [${i + 1}/${parsed.data.length}] Downloading image for "${dbItem.item_name}" (Drive ID: ${fileId})...`);
      const imageBuffer = await downloadDriveImage(fileId);

      const storagePath = `item-images/${Date.now()}_${fileId}.jpg`;

      // Upload to Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, imageBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadErr) {
        throw new Error(`Storage upload failed: ${uploadErr.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;

      // Update item_master
      const { error: updateMasterErr } = await supabase
        .from('item_master')
        .update({ image_url: publicUrl })
        .eq('id', dbItem.id);

      if (updateMasterErr) {
        throw new Error(`DB item_master update failed: ${updateMasterErr.message}`);
      }

      // Also update inventory_current
      await supabase
        .from('inventory_current')
        .update({ image_url: publicUrl })
        .eq('item_id', dbItem.id);

      console.log(`✅ [${i + 1}/${parsed.data.length}] "${dbItem.item_name}" -> Uploaded & Updated!`);
      stats.uploaded++;

      // Small delay to prevent network throttling
      await new Promise(r => setTimeout(r, 100));

    } catch (err) {
      console.error(`❌ [${i + 1}/${parsed.data.length}] Error processing "${sheetName}":`, err.message);
      stats.errors++;
    }
  }

  console.log('\n=========================================');
  console.log('🎉 Migration Completed!');
  console.log(`Total Rows Analyzed: ${stats.processed}`);
  console.log(`✅ Images Uploaded & DB Updated: ${stats.uploaded}`);
  console.log(`⏩ Skipped (No Image URL): ${stats.skippedNoUrl}`);
  console.log(`⚠️  Skipped (No Matching DB Item): ${stats.skippedNoMatch}`);
  console.log(`❌ Errors: ${stats.errors}`);
  console.log('=========================================\n');
}

runMigration().catch(err => {
  console.error('Fatal Migration Failure:', err);
  process.exit(1);
});