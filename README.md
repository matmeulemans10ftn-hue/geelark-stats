# GEELARK - IG STATS — Guide de déploiement (100% gratuit)

## 1\. Créer le projet Supabase (base de données)

1. Va sur [supabase.com](https://supabase.com) → crée un compte gratuit → "New Project"
2. Choisis un nom, un mot de passe de base de données (garde-le de côté), une région proche (Europe)
3. Une fois le projet créé, va dans **SQL Editor** (menu de gauche) → **New query**
4. Copie-colle tout le contenu du fichier `supabase/schema.sql` → clique **Run**
→ ça crée les 2 tables (`accounts` et `entries`)
5. Va dans **Project Settings > API** : note ces deux valeurs, tu en auras besoin :

   * **Project URL** (ex: `https://xxxxx.supabase.co`)
   * **anon public key** (une longue clé)

## 2\. Mettre le code sur GitHub

1. Va sur [github.com](https://github.com) → crée un compte si besoin
2. **New repository** → nomme-le `geelark-ig-stats` → **Create repository**
3. Sur la page du repo vide, clique **uploading an existing file**
4. Glisse-dépose TOUS les fichiers/dossiers de ce projet (garde la structure des dossiers)
5. **Commit changes**

## 3\. Déployer sur Vercel (hébergement)

1. Va sur [vercel.com](https://vercel.com) → **Sign up** → connecte-toi avec ton compte GitHub
2. **Add New > Project** → sélectionne ton repo `geelark-ig-stats`
3. Avant de cliquer Deploy, ouvre **Environment Variables** et ajoute :

   * `VITE\_SUPABASE\_URL` = ton Project URL de l'étape 1
   * `VITE\_SUPABASE\_ANON\_KEY` = ta anon public key de l'étape 1
4. Clique **Deploy**
5. Après \~1 minute, Vercel te donne une URL du type `geelark-ig-stats.vercel.app`
→ c'est ton CRM, accessible depuis n'importe où (PC, tel, etc.)

À partir de maintenant, à chaque fois que tu modifies un fichier sur GitHub, Vercel redéploie automatiquement la nouvelle version.

## 4\. (Optionnel) Activer la détection automatique des bans

Cette étape est plus technique — nécessite d'installer un outil en ligne de commande (Supabase CLI). Si tu préfères, tu peux aussi juste basculer le statut manuellement dans l'app (déjà possible) et sauter cette étape.

1. Installe [Node.js](https://nodejs.org) si pas déjà fait
2. Dans un terminal, installe la CLI Supabase : `npm install -g supabase`
3. Connecte-toi : `supabase login`
4. Lie le projet : `supabase link --project-ref TON\_PROJECT\_REF` (visible dans l'URL Supabase)
5. Déploie la fonction : `supabase functions deploy check-bans`
6. Dans Supabase : **Database > Extensions** → active `pg\_cron` et `pg\_net`
7. Dans **SQL Editor**, lance (remplace les valeurs par les tiennes) :

```sql
select cron.schedule(
  'check-bans-hourly',
  '0 \* \* \* \*', -- toutes les heures
  $$
  select net.http\_post(
    url := 'https://TON\_PROJECT\_REF.supabase.co/functions/v1/check-bans',
    headers := jsonb\_build\_object('Authorization', 'Bearer TA\_SERVICE\_ROLE\_KEY')
  );
  $$
);
```

La `service\_role key` se trouve dans **Project Settings > API** (différente de la anon key — ne jamais la mettre dans le code frontend, seulement ici côté serveur).

## Notes

* Tout reste gratuit dans les limites de ce projet (50 comptes, usage quotidien)
* La détection auto de ban ne fonctionne que pour les comptes **supprimés/désactivés** (404), pas pour les comptes juste restreints ou shadowban — pour ces cas-là, bascule le statut "Faible" toi-même
* Si Instagram bloque temporairement les requêtes de la fonction, augmente l'intervalle entre les vérifications dans le fichier `check-bans/index.ts`

