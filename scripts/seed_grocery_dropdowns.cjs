const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hfvbyktusslocxsblenu.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdmJ5a3R1c3Nsb2N4c2JsZW51Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzE5OTM4NSwiZXhwIjoyMTAyNzc1Mzg1fQ.f1t-aMATbAuvDBaLufC6J8g-1HcP3EOo2rmmf5bofc4';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const groceryDropdowns = [
  // Inventory Types
  { category: 'inventory_type', value: 'Grocery' },
  { category: 'inventory_type', value: 'Grocery - Dry Goods' },
  { category: 'inventory_type', value: 'Grocery - Spices & Oils' },
  { category: 'inventory_type', value: 'Grocery - Dairy & Cold' },
  { category: 'inventory_type', value: 'Grocery - Beverages' },
  { category: 'inventory_type', value: 'Grocery - Fresh Produce' },

  // Departments
  { category: 'department', value: 'Kitchen Grocery' },
  { category: 'department', value: 'Store Room' },
  { category: 'department', value: 'Bakery & Desserts' },
  { category: 'department', value: 'Bar & Beverages' },

  // Units
  { category: 'unit', value: 'KG' },
  { category: 'unit', value: 'GM' },
  { category: 'unit', value: 'LTR' },
  { category: 'unit', value: 'ML' },
  { category: 'unit', value: 'PKT' },
  { category: 'unit', value: 'BOX' },
  { category: 'unit', value: 'BAG' },
  { category: 'unit', value: 'CAN' },
  { category: 'unit', value: 'BOTTLE' },
  { category: 'unit', value: 'TIN' }
];

async function seedGroceryDropdowns() {
  console.log('Seeding Grocery Dropdown Options into Supabase...');

  // Fetch existing dropdown options
  const { data: existing, error: fetchErr } = await supabase
    .from('dropdown_options')
    .select('category, value');

  if (fetchErr) {
    console.error('Error fetching existing dropdowns:', fetchErr);
    return;
  }

  const existingSet = new Set((existing || []).map(d => `${d.category}:${d.value.toLowerCase()}`));

  const toInsert = groceryDropdowns.filter(d => !existingSet.has(`${d.category}:${d.value.toLowerCase()}`));

  if (toInsert.length === 0) {
    console.log('All Grocery dropdown options are already seeded in Supabase!');
    return;
  }

  console.log(`Inserting ${toInsert.length} new Grocery dropdown options...`);
  const { data, error } = await supabase
    .from('dropdown_options')
    .insert(toInsert)
    .select();

  if (error) {
    console.error('Error inserting Grocery dropdown options:', error);
  } else {
    console.log(`Successfully seeded ${data.length} Grocery dropdown options!`);
  }
}

seedGroceryDropdowns();
