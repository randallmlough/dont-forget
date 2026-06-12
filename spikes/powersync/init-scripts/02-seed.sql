-- Seed: users A and B share Household H1; Household H2 contains only A.
-- This is the fixture the Step 1 verification checks: A receives H1+H2 rows,
-- B receives only H1 rows.

\connect postgres;

insert into public.users (id, clerk_user_id, display_name) values
  ('user-a', 'clerk_a', 'Alice'),
  ('user-b', 'clerk_b', 'Bob');

insert into public.households (id, name) values
  ('h1', 'Shared Household H1'),
  ('h2', 'Alice-only Household H2');

insert into public.memberships (id, household_id, user_id, role, status) values
  ('m-a-h1', 'h1', 'user-a', 'owner',  'active'),
  ('m-b-h1', 'h1', 'user-b', 'member', 'active'),
  ('m-a-h2', 'h2', 'user-a', 'owner',  'active');

-- One list per household, with items, to exercise the join chain.
insert into public.lists (id, household_id, name, created_by_user_id) values
  ('list-h1', 'h1', 'Groceries (H1)', 'user-a'),
  ('list-h2', 'h2', 'Hardware (H2)',  'user-a');

insert into public.items (id, list_id, name, quantity, position, created_by_user_id) values
  ('item-h1-1', 'list-h1', 'Milk',   1, 0, 'user-a'),
  ('item-h1-2', 'list-h1', 'Eggs',   2, 1, 'user-b'),
  ('item-h2-1', 'list-h2', 'Screws', 1, 0, 'user-a');

-- A per-user check so item_checks is non-empty for the row-set verification.
insert into public.item_checks (item_id, user_id, checked_at) values
  ('item-h1-1', 'user-a', now());
