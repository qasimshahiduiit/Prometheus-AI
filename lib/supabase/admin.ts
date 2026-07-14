import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Service-role client — bypasses RLS. SERVER-ONLY; never import this into a
 * client component. The app enforces per-user ownership in code (every query
 * filters by user_id), mirroring how the previous SQLite layer worked.
 */
export const admin = createClient(URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Private Storage bucket holding uploaded files and generated images. */
export const BUCKET = 'uploads';

export const newId = () => crypto.randomUUID();
