-- Pre-push backfill: Signature.groupId was added as required after personal signatures existed.
-- Adds the column nullable, backfills from Group, then prisma db push can apply NOT NULL + FK.
DO $$
DECLARE
  default_group_id TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Signature'
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO default_group_id FROM "Group"
  WHERE slug = 'tda'
  LIMIT 1;

  IF default_group_id IS NULL THEN
    SELECT id INTO default_group_id FROM "Group"
    ORDER BY "createdAt" ASC
    LIMIT 1;
  END IF;

  IF default_group_id IS NULL THEN
    RAISE NOTICE 'No Group row found; skipping Signature groupId backfill';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Signature' AND column_name = 'groupId'
  ) THEN
    ALTER TABLE "Signature" ADD COLUMN "groupId" TEXT;
  END IF;

  UPDATE "Signature"
  SET "groupId" = default_group_id
  WHERE "groupId" IS NULL;
END $$;
