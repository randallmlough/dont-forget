-- Single source-of-truth Postgres: ALL Households in one database.
-- Mirrors the production SQLite/Drizzle schema (db/schema/household.ts +
-- the directory tables), with text PKs to match the app's id strategy and
-- app-owned updated_at for LWW ordering. All deletes are tombstones
-- (deleted_at), per ADR-0002.

\connect postgres;

-- ---- Directory tables (server-only in prod; here in the same DB) ----------
create table public.users (
  id            text primary key,
  clerk_user_id text,
  display_name  text not null
);

create table public.households (
  id   text primary key,
  name text not null
);

create table public.memberships (
  id           text primary key,
  household_id text not null references public.households (id),
  user_id      text not null references public.users (id),
  role         text not null,          -- 'owner' | 'member'
  status       text not null,          -- 'active' | ...
  unique (household_id, user_id)
);

-- ---- Product tables -------------------------------------------------------
-- household_id added to lists (the plan's required denormalization on lists).
-- items/item_checks reach the Household via list_id/item_id joins; whether the
-- sync stream can resolve that join is the empirical question recorded in NOTES.
create table public.lists (
  id                 text primary key,
  household_id       text not null references public.households (id),
  name               text not null,
  created_by_user_id text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz,
  deleted_at         timestamptz
);

create table public.items (
  id                 text primary key,
  list_id            text not null references public.lists (id),
  name               text not null,
  quantity           integer,
  notes              text,
  position           integer,
  created_by_user_id text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create table public.item_checks (
  item_id    text not null references public.items (id),
  user_id    text not null,
  checked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

-- PowerSync logical-replication publication. Only synced tables are listed.
create publication powersync for table
  users, households, memberships, lists, items, item_checks;
