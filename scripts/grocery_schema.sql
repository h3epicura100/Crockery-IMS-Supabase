-- ====================================================================
-- GROCERY MODULE DATABASE SETUP SCRIPT
-- Crockery IMS - Supabase Integration
-- ====================================================================
-- This SQL script adds standard Grocery inventory types, departments,
-- and measurement units into the `dropdown_options` table, and adds
-- starter grocery item templates into `item_master`.
-- ====================================================================

-- 1. Insert Grocery Inventory Types into dropdown_options
INSERT INTO dropdown_options (category, value)
VALUES
  ('inventory_type', 'Grocery'),
  ('inventory_type', 'Grocery - Dry Goods'),
  ('inventory_type', 'Grocery - Spices & Oils'),
  ('inventory_type', 'Grocery - Dairy & Cold'),
  ('inventory_type', 'Grocery - Beverages'),
  ('inventory_type', 'Grocery - Fresh Produce')
ON CONFLICT DO NOTHING;

-- 2. Insert Grocery Departments into dropdown_options
INSERT INTO dropdown_options (category, value)
VALUES
  ('department', 'Kitchen Grocery'),
  ('department', 'Store Room'),
  ('department', 'Bakery & Desserts'),
  ('department', 'Bar & Beverages')
ON CONFLICT DO NOTHING;

-- 3. Insert Grocery Units into dropdown_options
INSERT INTO dropdown_options (category, value)
VALUES
  ('unit', 'KG'),
  ('unit', 'GM'),
  ('unit', 'LTR'),
  ('unit', 'ML'),
  ('unit', 'PKT'),
  ('unit', 'BOX'),
  ('unit', 'BAG'),
  ('unit', 'CAN'),
  ('unit', 'BOTTLE'),
  ('unit', 'TIN')
ON CONFLICT DO NOTHING;

-- 4. Starter Grocery Items (Optional Sample Data)
-- You can uncomment the lines below to add sample grocery master items:
/*
INSERT INTO item_master (item_name, inventory_type, department, unit, rental_price, damage_price)
VALUES
  ('Basmati Rice 5kg', 'Grocery - Dry Goods', 'Kitchen Grocery', 'BAG', 0.00, 0.00),
  ('Refined Sunflower Oil 1L', 'Grocery - Spices & Oils', 'Kitchen Grocery', 'LTR', 0.00, 0.00),
  ('Turmeric Powder 500g', 'Grocery - Spices & Oils', 'Kitchen Grocery', 'PKT', 0.00, 0.00),
  ('Amul Butter 500g', 'Grocery - Dairy & Cold', 'Kitchen Grocery', 'PKT', 0.00, 0.00),
  ('Sugar 1kg', 'Grocery - Dry Goods', 'Kitchen Grocery', 'KG', 0.00, 0.00)
ON CONFLICT DO NOTHING;
*/
