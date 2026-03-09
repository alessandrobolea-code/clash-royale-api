// Client Supabase — importato da CDN in ogni HTML

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
