-- ============================================
-- GEELARK - IG STATS : schéma de base de données
-- À coller dans Supabase > SQL Editor > New query > Run
-- ============================================

create extension if not exists "pgcrypto";

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  status text not null default 'active' check (status in ('active', 'weak', 'banned')),
  created_at timestamptz not null default now()
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  date date not null,
  views integer not null default 0,
  likes integer not null default 0,
  followers integer not null default 0,
  unique (account_id, date)
);

create index if not exists entries_account_date_idx on entries (account_id, date);

-- Row Level Security : ouvert en lecture/écriture pour la clé "anon"
-- (suffisant pour un usage perso / petite équipe ; pas d'authentification requise)
alter table accounts enable row level security;
alter table entries enable row level security;

create policy "accounts_all_access" on accounts
  for all using (true) with check (true);

create policy "entries_all_access" on entries
  for all using (true) with check (true);
