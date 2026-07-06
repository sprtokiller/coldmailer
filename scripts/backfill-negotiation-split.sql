-- Pre-push backfill: splits the wide `Interaction` table (NOTE/EMAIL/FULFILLMENT
-- discriminated by an enum) into dedicated `Email`/`Note` tables, moves fulfillment
-- (myToThem/themToUs) onto `Negotiation` (renamed from `ProjectRecord`), and converts
-- the `contactBlacklist`/`additionalAddresses` JSON arrays into relational tables.
--
-- Whole thing is guarded on "Interaction" still existing, so once it has fully run
-- once (ending in DROP TABLE "Interaction"), every subsequent container start is a
-- no-op — required because entrypoint.sh runs this on every boot, not just the first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Interaction'
  ) THEN
    RETURN;
  END IF;

  -- ── 1. Rename ProjectRecord -> Negotiation (data + id preserved) ────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ProjectRecord'
  ) THEN
    ALTER TABLE "ProjectRecord" RENAME TO "Negotiation";
  END IF;

  -- Rename constraints/indexes so `db push` sees no further diff afterwards.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectRecord_pkey') THEN
    ALTER TABLE "Negotiation" RENAME CONSTRAINT "ProjectRecord_pkey" TO "Negotiation_pkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectRecord_projectId_globalRecordId_key') THEN
    ALTER TABLE "Negotiation" RENAME CONSTRAINT "ProjectRecord_projectId_globalRecordId_key" TO "Negotiation_projectId_globalRecordId_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectRecord_projectId_fkey') THEN
    ALTER TABLE "Negotiation" RENAME CONSTRAINT "ProjectRecord_projectId_fkey" TO "Negotiation_projectId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectRecord_globalRecordId_fkey') THEN
    ALTER TABLE "Negotiation" RENAME CONSTRAINT "ProjectRecord_globalRecordId_fkey" TO "Negotiation_globalRecordId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ProjectRecord_globalRecordId_idx') THEN
    ALTER INDEX "ProjectRecord_globalRecordId_idx" RENAME TO "Negotiation_globalRecordId_idx";
  END IF;

  -- ── 2. New columns on Negotiation ────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Negotiation' AND column_name = 'myToThem'
  ) THEN
    ALTER TABLE "Negotiation" ADD COLUMN "myToThem" TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Negotiation' AND column_name = 'themToUs'
  ) THEN
    ALTER TABLE "Negotiation" ADD COLUMN "themToUs" TEXT;
  END IF;

  -- ── 3. New tables (exact shape Prisma would generate, so `db push` no-ops) ──
  CREATE TABLE IF NOT EXISTS "Email" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "direction" "MailDirection" NOT NULL,
    "subject" TEXT,
    "sentAt" TIMESTAMP(3),
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "ccAddress" TEXT,
    "gmailId" TEXT,
    "content" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isUnknownContact" BOOLEAN NOT NULL DEFAULT false,
    "unknownContactAddress" TEXT,
    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
  );

  CREATE TABLE IF NOT EXISTS "EmailAssignee" (
    "emailId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailAssignee_pkey" PRIMARY KEY ("emailId", "userId")
  );

  CREATE TABLE IF NOT EXISTS "Note" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
  );

  CREATE TABLE IF NOT EXISTS "NoteAssignee" (
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteAssignee_pkey" PRIMARY KEY ("noteId", "userId")
  );

  CREATE TABLE IF NOT EXISTS "FulfillmentAssignee" (
    "negotiationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FulfillmentAssignee_pkey" PRIMARY KEY ("negotiationId", "userId")
  );

  CREATE TABLE IF NOT EXISTS "NegotiationAddress" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NegotiationAddress_pkey" PRIMARY KEY ("id")
  );

  CREATE TABLE IF NOT EXISTS "NegotiationBlacklistedAddress" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NegotiationBlacklistedAddress_pkey" PRIMARY KEY ("id")
  );

  -- Indexes / unique constraints
  CREATE INDEX IF NOT EXISTS "Email_negotiationId_idx" ON "Email"("negotiationId");
  CREATE UNIQUE INDEX IF NOT EXISTS "Email_gmailId_negotiationId_key" ON "Email"("gmailId", "negotiationId");
  CREATE INDEX IF NOT EXISTS "EmailAssignee_userId_idx" ON "EmailAssignee"("userId");
  CREATE INDEX IF NOT EXISTS "Note_negotiationId_idx" ON "Note"("negotiationId");
  CREATE INDEX IF NOT EXISTS "NoteAssignee_userId_idx" ON "NoteAssignee"("userId");
  CREATE INDEX IF NOT EXISTS "FulfillmentAssignee_userId_idx" ON "FulfillmentAssignee"("userId");
  CREATE UNIQUE INDEX IF NOT EXISTS "NegotiationAddress_negotiationId_address_key" ON "NegotiationAddress"("negotiationId", "address");
  CREATE UNIQUE INDEX IF NOT EXISTS "NegotiationBlacklistedAddress_negotiationId_address_key" ON "NegotiationBlacklistedAddress"("negotiationId", "address");

  -- Foreign keys
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Email_negotiationId_fkey') THEN
    ALTER TABLE "Email" ADD CONSTRAINT "Email_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Email_createdBy_fkey') THEN
    ALTER TABLE "Email" ADD CONSTRAINT "Email_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailAssignee_emailId_fkey') THEN
    ALTER TABLE "EmailAssignee" ADD CONSTRAINT "EmailAssignee_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailAssignee_userId_fkey') THEN
    ALTER TABLE "EmailAssignee" ADD CONSTRAINT "EmailAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Note_negotiationId_fkey') THEN
    ALTER TABLE "Note" ADD CONSTRAINT "Note_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Note_createdBy_fkey') THEN
    ALTER TABLE "Note" ADD CONSTRAINT "Note_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NoteAssignee_noteId_fkey') THEN
    ALTER TABLE "NoteAssignee" ADD CONSTRAINT "NoteAssignee_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NoteAssignee_userId_fkey') THEN
    ALTER TABLE "NoteAssignee" ADD CONSTRAINT "NoteAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FulfillmentAssignee_negotiationId_fkey') THEN
    ALTER TABLE "FulfillmentAssignee" ADD CONSTRAINT "FulfillmentAssignee_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FulfillmentAssignee_userId_fkey') THEN
    ALTER TABLE "FulfillmentAssignee" ADD CONSTRAINT "FulfillmentAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NegotiationAddress_negotiationId_fkey') THEN
    ALTER TABLE "NegotiationAddress" ADD CONSTRAINT "NegotiationAddress_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NegotiationBlacklistedAddress_negotiationId_fkey') THEN
    ALTER TABLE "NegotiationBlacklistedAddress" ADD CONSTRAINT "NegotiationBlacklistedAddress_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- ── 4. Fill any Negotiation gap (Interaction rows whose ProjectRecord/Negotiation
  --       was never created, e.g. the join-project path in partners/index.post.ts) ──
  INSERT INTO "Negotiation" ("id", "projectId", "globalRecordId")
  SELECT DISTINCT ON (i."projectId", i."globalRecordId")
    substr(md5(random()::text || clock_timestamp()::text || i."projectId" || i."globalRecordId"), 1, 25),
    i."projectId", i."globalRecordId"
  FROM "Interaction" i
  WHERE NOT EXISTS (
    SELECT 1 FROM "Negotiation" n
    WHERE n."projectId" = i."projectId" AND n."globalRecordId" = i."globalRecordId"
  )
  ORDER BY i."projectId", i."globalRecordId";

  -- ── 5. Backfill Email / Note (id preserved so InteractionAssignee maps directly) ──
  INSERT INTO "Email" (
    "id", "negotiationId", "direction", "subject", "sentAt", "fromAddress", "toAddress",
    "ccAddress", "gmailId", "content", "createdBy", "createdAt", "updatedAt",
    "isUnknownContact", "unknownContactAddress"
  )
  SELECT
    i."id", n."id", i."direction", i."subject", i."sentAt", i."fromAddress", i."toAddress",
    i."ccAddress", i."gmailId", i."content", i."createdBy", i."createdAt", i."updatedAt",
    i."isUnknownContact", i."unknownContactAddress"
  FROM "Interaction" i
  JOIN "Negotiation" n ON n."projectId" = i."projectId" AND n."globalRecordId" = i."globalRecordId"
  WHERE i."type" = 'EMAIL'
  ON CONFLICT ("id") DO NOTHING;

  INSERT INTO "Note" ("id", "negotiationId", "content", "createdBy", "createdAt", "updatedAt")
  SELECT i."id", n."id", COALESCE(i."content", ''), i."createdBy", i."createdAt", i."updatedAt"
  FROM "Interaction" i
  JOIN "Negotiation" n ON n."projectId" = i."projectId" AND n."globalRecordId" = i."globalRecordId"
  WHERE i."type" = 'NOTE'
  ON CONFLICT ("id") DO NOTHING;

  -- FULFILLMENT interactions were per-negotiation free text, not a list — if more
  -- than one somehow exists for the same negotiation, keep the most recent.
  UPDATE "Negotiation" n
  SET "myToThem" = f."myToThem", "themToUs" = f."themToUs"
  FROM (
    SELECT DISTINCT ON (i."projectId", i."globalRecordId")
      i."projectId", i."globalRecordId", i."myToThem", i."themToUs"
    FROM "Interaction" i
    WHERE i."type" = 'FULFILLMENT'
    ORDER BY i."projectId", i."globalRecordId", i."createdAt" DESC
  ) f
  WHERE n."projectId" = f."projectId" AND n."globalRecordId" = f."globalRecordId";

  -- ── 6. Backfill assignees ────────────────────────────────────────────────────
  INSERT INTO "EmailAssignee" ("emailId", "userId", "assignedAt")
  SELECT ia."interactionId", ia."userId", ia."assignedAt"
  FROM "InteractionAssignee" ia
  JOIN "Interaction" i ON i."id" = ia."interactionId"
  WHERE i."type" = 'EMAIL'
  ON CONFLICT ("emailId", "userId") DO NOTHING;

  INSERT INTO "NoteAssignee" ("noteId", "userId", "assignedAt")
  SELECT ia."interactionId", ia."userId", ia."assignedAt"
  FROM "InteractionAssignee" ia
  JOIN "Interaction" i ON i."id" = ia."interactionId"
  WHERE i."type" = 'NOTE'
  ON CONFLICT ("noteId", "userId") DO NOTHING;

  INSERT INTO "FulfillmentAssignee" ("negotiationId", "userId", "assignedAt")
  SELECT n."id", ia."userId", ia."assignedAt"
  FROM "InteractionAssignee" ia
  JOIN "Interaction" i ON i."id" = ia."interactionId"
  JOIN "Negotiation" n ON n."projectId" = i."projectId" AND n."globalRecordId" = i."globalRecordId"
  WHERE i."type" = 'FULFILLMENT'
  ON CONFLICT ("negotiationId", "userId") DO NOTHING;

  -- ── 7. Unpack JSON address arrays into relational tables ────────────────────
  INSERT INTO "NegotiationAddress" ("id", "negotiationId", "address", "createdAt")
  SELECT
    substr(md5(random()::text || clock_timestamp()::text || n."id" || addr.value), 1, 25),
    n."id", addr.value, now()
  FROM "Negotiation" n, jsonb_array_elements_text(n."additionalAddresses"::jsonb) AS addr(value)
  WHERE n."additionalAddresses" IS NOT NULL
  ON CONFLICT ("negotiationId", "address") DO NOTHING;

  INSERT INTO "NegotiationBlacklistedAddress" ("id", "negotiationId", "address", "createdAt")
  SELECT
    substr(md5(random()::text || clock_timestamp()::text || n."id" || addr.value), 1, 25),
    n."id", addr.value, now()
  FROM "Negotiation" n, jsonb_array_elements_text(n."contactBlacklist"::jsonb) AS addr(value)
  WHERE n."contactBlacklist" IS NOT NULL
  ON CONFLICT ("negotiationId", "address") DO NOTHING;

  -- ── 8. Drop old structures (last step — makes the outer guard false forever) ─
  DROP TABLE IF EXISTS "InteractionAssignee";
  DROP TABLE IF EXISTS "Interaction";
  DROP TYPE IF EXISTS "InteractionType";
  ALTER TABLE "Negotiation" DROP COLUMN IF EXISTS "contactBlacklist";
  ALTER TABLE "Negotiation" DROP COLUMN IF EXISTS "additionalAddresses";
END $$;
