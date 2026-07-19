import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquant. Vérifie tes variables d\'environnement.'
  );
}

export const supabase = createClient(url, anonKey);
