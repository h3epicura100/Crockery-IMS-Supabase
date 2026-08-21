/**
 * Single source of truth for every Supabase table/column/enum name and
 * storage bucket used across the app. Pages should import from here instead
 * of hardcoding string literals in `.from(...)`/`.select(...)` calls — if the
 * database schema changes (a column renamed, a table renamed), only this
 * file needs updating, not every page that touches the DB.
 *
 * Generated from the live schema (see supabase/migrations/*.sql for the
 * authoritative DDL) — keep this in sync whenever a migration changes a
 * table/column/enum referenced here.
 */

export const TABLES = {
  ITEM_MASTER: 'item_master',
  DROPDOWN_OPTIONS: 'dropdown_options',
  LOGIN: 'login',
  STOCK_TRANSACTIONS: 'stock_transactions',
  ISSUES: 'issues',
  RETURNS: 'returns',
  INVENTORY_CURRENT: 'inventory_current',
  INVENTORY_DAILY_SNAPSHOT: 'inventory_daily_snapshot'
};

export const COLUMNS = {
  ITEM_MASTER: {
    ID: 'id',
    ITEM_NAME: 'item_name',
    INVENTORY_TYPE: 'inventory_type',
    DEPARTMENT: 'department',
    UNIT: 'unit',
    RENTAL_PRICE: 'rental_price',
    DAMAGE_PRICE: 'damage_price',
    IMAGE_URL: 'image_url',
    CREATED_AT: 'created_at',
    UPDATED_AT: 'updated_at'
  },
  DROPDOWN_OPTIONS: {
    ID: 'id',
    CATEGORY: 'category',
    VALUE: 'value',
    CREATED_AT: 'created_at'
  },
  LOGIN: {
    ID: 'id',
    NAME: 'name',
    USERNAME: 'username',
    PASSWORD: 'password',
    ROLE: 'role',
    CREATED_AT: 'created_at'
  },
  STOCK_TRANSACTIONS: {
    ID: 'id',
    SOURCE: 'source',
    SERIAL_NO: 'serial_no',
    ITEM_ID: 'item_id',
    VENDOR_NAME: 'vendor_name',
    QTY: 'qty',
    UNIT: 'unit',
    PER_UNIT: 'per_unit',
    TOTAL_COST: 'total_cost', // generated column — never write to this
    IMAGE_URL: 'image_url',
    REMARKS: 'remarks',
    CREATED_AT: 'created_at'
  },
  ISSUES: {
    ID: 'id',
    SERIAL_NO: 'serial_no',
    ITEM_ID: 'item_id',
    PARTY_NAME: 'party_name',
    EVENT_DATE: 'event_date',
    ISSUE_QTY: 'issue_qty',
    DAMAGE_RATE: 'damage_rate',
    RENTING_RATE: 'renting_rate',
    OPENING_BALANCE: 'opening_balance',
    CLOSING_BALANCE: 'closing_balance',
    VENUE_NAME: 'venue_name',
    IMAGE_URL: 'image_url',
    REMARKS: 'remarks',
    EVENT_TYPE: 'event_type', // plain text, not a FK (see dropdown_options)
    ESTIMATED_COST: 'estimated_cost', // generated column — never write to this
    FOR_TYPE: 'for_type',
    ISSUER: 'issuer', // plain text, not a FK (see dropdown_options)
    DISHES: 'dishes',
    CREATED_AT: 'created_at'
  },
  RETURNS: {
    ID: 'id',
    SERIAL_NO: 'serial_no',
    ITEM_ID: 'item_id',
    PARTY_NAME: 'party_name',
    EVENT_DATE: 'event_date',
    RETURN_DATE: 'return_date',
    ISSUE_QTY: 'issue_qty',
    RETURN_QTY: 'return_qty',
    DAMAGE_QTY: 'damage_qty',
    MISSING_QTY: 'missing_qty',
    DAMAGE_RATE: 'damage_rate',
    RENTING_RATE: 'renting_rate',
    OPENING_BALANCE: 'opening_balance',
    CLOSING_BALANCE: 'closing_balance',
    TOTAL_BALANCE: 'total_balance',
    IMAGE_URL: 'image_url',
    REMARKS: 'remarks',
    TOTAL_COST: 'total_cost', // generated column — never write to this
    FOR_TYPE: 'for_type',
    CREATED_AT: 'created_at'
  },
  INVENTORY_CURRENT: {
    ITEM_ID: 'item_id', // primary key
    TOTAL_PURCHASED: 'total_purchased', // TODAY's activity only
    TOTAL_ISSUE: 'total_issue',
    TOTAL_RETURN: 'total_return',
    TOTAL_DAMAGE: 'total_damage',
    TOTAL_MISSING: 'total_missing',
    OPENING_BALANCE: 'opening_balance', // fixed for the whole day, set by rollover_day()
    CLOSING_BALANCE: 'closing_balance', // NULL until close_day() freezes it at 23:00 IST
    CURRENT_STOCK: 'current_stock', // generated column — live estimate, never write to this
    IMAGE_URL: 'image_url',
    UPDATED_AT: 'updated_at'
  },
  INVENTORY_DAILY_SNAPSHOT: {
    ID: 'id',
    SNAPSHOT_DATE: 'snapshot_date',
    ITEM_ID: 'item_id',
    TOTAL_PURCHASED: 'total_purchased',
    OPENING_BALANCE: 'opening_balance',
    CLOSING_BALANCE: 'closing_balance',
    TOTAL_BALANCE: 'total_balance',
    TOTAL_ISSUE: 'total_issue',
    TOTAL_RETURN: 'total_return',
    TOTAL_DAMAGE: 'total_damage',
    TOTAL_MISSING: 'total_missing',
    CREATED_AT: 'created_at'
  }
};

// Columns that are DB-GENERATED (computed via `GENERATED ALWAYS AS ... STORED`)
// — insert/update payloads must never include these, Postgres rejects it.
export const GENERATED_COLUMNS = {
  [TABLES.STOCK_TRANSACTIONS]: [COLUMNS.STOCK_TRANSACTIONS.TOTAL_COST],
  [TABLES.ISSUES]: [COLUMNS.ISSUES.ESTIMATED_COST],
  [TABLES.RETURNS]: [COLUMNS.RETURNS.TOTAL_COST],
  [TABLES.INVENTORY_CURRENT]: [COLUMNS.INVENTORY_CURRENT.CURRENT_STOCK]
};

// Columns AUTO-ASSIGNED by a BEFORE INSERT trigger when left null — safe to
// omit entirely from an insert payload (see 0009_serial_number_scheme.sql).
export const AUTO_SERIAL_COLUMNS = [
  COLUMNS.ISSUES.SERIAL_NO,
  COLUMNS.RETURNS.SERIAL_NO,
  COLUMNS.STOCK_TRANSACTIONS.SERIAL_NO
];

export const ENUMS = {
  ROLE: { ADMIN: 'admin', USER: 'user' },
  STOCK_SOURCE: { ADD_STOCK: 'add_stock', RE_PURCHASE: 're_purchase' },
  FOR_TYPE: { H3: 'H3', RENT: 'Rent' }
};

// dropdown_options.category values (see Master.jsx). inventory_type,
// department, and unit are strict, admin-managed lists — Add-Stock (and
// Master's own Item form) select from these rather than free text, so new
// values only ever get added deliberately via Master > Dropdowns.
export const DROPDOWN_CATEGORY = {
  ISSUER: 'issuer',
  EVENT_TYPE: 'event_type',
  INVENTORY_TYPE: 'inventory_type',
  DEPARTMENT: 'department',
  UNIT: 'unit'
};

// Single Supabase Storage bucket for all app images, split into two logical
// folders via path prefix (see supabaseStorage.js). Uploads default to
// reusing an item's existing image_url rather than re-uploading the same
// photo on every Re-Purchase/Issue/Return — a fresh upload only happens when
// the user explicitly attaches a new file.
export const STORAGE_BUCKETS = {
  CROCKERY_IMAGE: 'crockery-image'
};

export const STORAGE_FOLDERS = {
  ITEM_IMAGES: 'item-images', // item photos: Master > Items, Stock Add/Re-Purchase
  ISSUE_RETURN_IMAGES: 'issue-return-images' // photos attached directly to an issue/return record
};

/**
 * Standard "embed item_master" select fragment for tables that FK to it via
 * item_id (stock_transactions, issues, returns, inventory_current,
 * inventory_daily_snapshot). Pass which item_master columns you need.
 *
 * Example: `.select(withItemMaster('inventory_type, department'))`
 * -> "item_master ( inventory_type, department )"
 */
export const withItemMaster = (cols = '*') => `${TABLES.ITEM_MASTER} ( ${cols} )`;
