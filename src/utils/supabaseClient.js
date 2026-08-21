import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// The app's sole data backend — Google Sheets/Apps Script has been fully
// retired (see supabase/migrations/*.sql for the schema this replaced).
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
