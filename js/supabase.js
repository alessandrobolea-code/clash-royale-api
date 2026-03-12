// Client Supabase globale — disponibile come `db` in tutti gli altri file
// Nota: assicurati di aver configurato SUPABASE_URL e SUPABASE_ANON_KEY in config.js
// Nota Supabase: per sviluppo puoi disabilitare la RLS su tutte le tabelle,
//                oppure aggiungere policies "allow all" per gli utenti anonimi.

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
