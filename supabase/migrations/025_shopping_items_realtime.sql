-- Live shopping list: members of a household see each other's changes without
-- reloading (ShoppingClient subscribes to shopping_items through Supabase Realtime).
-- Realtime only streams tables in the supabase_realtime publication, and no
-- migration had added this one. Safe to re-run: skips the table if it's already in.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shopping_items'
  ) then
    alter publication supabase_realtime add table public.shopping_items;
  end if;
end $$;
