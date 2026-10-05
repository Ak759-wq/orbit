import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SUPABASE_ENABLED = Boolean(url && anonKey);

// Supabase-only mode: without credentials the app shows a setup
// screen with instructions instead of pretending to work.
export const supabase = SUPABASE_ENABLED ? createClient(url, anonKey) : null;
