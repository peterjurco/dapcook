-- The migration ledger is created by scripts/apply-migrations.ts, not by a
-- migration, so it was the one public table without RLS — Supabase's advisor
-- flagged it on staging. Nothing secret lives in it, but the default grants let
-- anon delete rows, and an emptied ledger makes the next CI run re-apply
-- migrations over a schema that already has them.
--
-- No policies: postgres and service_role bypass RLS, everyone else gets
-- nothing. Guarded because production has no ledger — it is applied by hand —
-- and this has to be a no-op there rather than an error.
DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public.schema_migrations FROM anon, authenticated';
  END IF;
END
$$;
