// Edge Function : à déployer avec `supabase functions deploy check-bans`
// Vérifie chaque compte "active" ou "weak" et le passe en "banned"
// si la page Instagram publique n'est plus accessible.
// Une exécution programmée (cron) l'appelle toutes les heures.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, username, status')
    .neq('status', 'banned');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const results = [];

  for (const acc of accounts ?? []) {
    try {
      const res = await fetch(`https://www.instagram.com/${acc.username}/`, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        },
      });

      // Instagram renvoie 404 pour un compte supprimé/inexistant.
      // Un 200 ne garantit pas que le compte est actif (contenu privé possible),
      // donc on ne bannit que sur un 404 clair.
      if (res.status === 404) {
        await supabase.from('accounts').update({ status: 'banned' }).eq('id', acc.id);
        results.push({ username: acc.username, status: 'banned' });
      } else {
        results.push({ username: acc.username, status: 'ok', http: res.status });
      }
    } catch (e) {
      results.push({ username: acc.username, status: 'error', message: String(e) });
    }

    // Petite pause entre chaque requête pour éviter d'être bloqué par Instagram
    await new Promise((r) => setTimeout(r, 1500));
  }

  return new Response(JSON.stringify({ checked: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
