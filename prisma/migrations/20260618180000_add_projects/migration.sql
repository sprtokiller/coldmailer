-- Rename the existing project types.
UPDATE "Group" SET "name" = 'Tour de App' WHERE "slug" = 'tda' OR "name" = 'TdA';
UPDATE "Group" SET "name" = 'Prezentiáda' WHERE "slug" = 'ppt' OR "name" = 'PPT';
UPDATE "Group" SET "name" = 'pIšQworky' WHERE "slug" = 'xo' OR "name" = 'XO';

-- Add projects and project membership.
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserProject" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProject_pkey" PRIMARY KEY ("userId", "projectId")
);

CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
CREATE UNIQUE INDEX "Project_groupId_name_key" ON "Project"("groupId", "name");
CREATE INDEX "Project_groupId_idx" ON "Project"("groupId");
CREATE INDEX "UserProject_projectId_idx" ON "UserProject"("projectId");

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserProject"
  ADD CONSTRAINT "UserProject_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserProject"
  ADD CONSTRAINT "UserProject_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Project" ("id", "name", "slug", "groupId")
SELECT 'project-tda27', 'TdA27', 'tda27', "id"
FROM "Group"
WHERE "slug" = 'tda'
ON CONFLICT ("slug") DO UPDATE
SET "name" = EXCLUDED."name", "groupId" = EXCLUDED."groupId";

-- Library assets can be scoped either to a project or to its parent project type.
ALTER TABLE "SystemPrompt" ADD COLUMN "projectId" TEXT;
ALTER TABLE "ContextPart" ADD COLUMN "projectId" TEXT;
ALTER TABLE "SellingPoint" ADD COLUMN "projectId" TEXT;
ALTER TABLE "EmailDraft" ADD COLUMN "projectId" TEXT;

ALTER TABLE "SystemPrompt"
  ADD CONSTRAINT "SystemPrompt_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContextPart"
  ADD CONSTRAINT "ContextPart_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SellingPoint"
  ADD CONSTRAINT "SellingPoint_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailDraft"
  ADD CONSTRAINT "EmailDraft_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SystemPrompt" DROP CONSTRAINT IF EXISTS "SystemPrompt_groupId_fkey";
ALTER TABLE "ContextPart" DROP CONSTRAINT IF EXISTS "ContextPart_groupId_fkey";
ALTER TABLE "SellingPoint" DROP CONSTRAINT IF EXISTS "SellingPoint_groupId_fkey";
ALTER TABLE "EmailDraft" DROP CONSTRAINT IF EXISTS "EmailDraft_groupId_fkey";

ALTER TABLE "SystemPrompt"
  ADD CONSTRAINT "SystemPrompt_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContextPart"
  ADD CONSTRAINT "ContextPart_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SellingPoint"
  ADD CONSTRAINT "SellingPoint_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailDraft"
  ADD CONSTRAINT "EmailDraft_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing reusable assets become general Tour de App assets.
UPDATE "SystemPrompt"
SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug" = 'tda'),
    "projectId" = NULL
WHERE "isSystem" = FALSE;

UPDATE "ContextPart"
SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug" = 'tda'),
    "projectId" = NULL;

UPDATE "SellingPoint"
SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug" = 'tda'),
    "projectId" = NULL;

UPDATE "EmailDraft"
SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug" = 'tda'),
    "projectId" = NULL;

ALTER TABLE "SystemPrompt"
  ADD CONSTRAINT "SystemPrompt_scope_check"
  CHECK ("isSystem" = TRUE OR num_nonnulls("groupId", "projectId") = 1);
ALTER TABLE "ContextPart"
  ADD CONSTRAINT "ContextPart_scope_check"
  CHECK (num_nonnulls("groupId", "projectId") = 1);
ALTER TABLE "SellingPoint"
  ADD CONSTRAINT "SellingPoint_scope_check"
  CHECK (num_nonnulls("groupId", "projectId") = 1);
ALTER TABLE "EmailDraft"
  ADD CONSTRAINT "EmailDraft_scope_check"
  CHECK (num_nonnulls("groupId", "projectId") = 1);

-- Every pipeline belongs to a concrete project.
ALTER TABLE "PipelineRun" ADD COLUMN "projectId" TEXT;

UPDATE "PipelineRun"
SET "projectId" = (SELECT "id" FROM "Project" WHERE "slug" = 'tda27');

ALTER TABLE "PipelineRun" ALTER COLUMN "projectId" SET NOT NULL;
CREATE INDEX "PipelineRun_projectId_idx" ON "PipelineRun"("projectId");
ALTER TABLE "PipelineRun"
  ADD CONSTRAINT "PipelineRun_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PipelineRun" DROP CONSTRAINT IF EXISTS "PipelineRun_groupId_fkey";
ALTER TABLE "PipelineRun" DROP COLUMN IF EXISTS "groupId";

-- Preserve access for all existing users after the hierarchy is introduced.
INSERT INTO "UserProject" ("userId", "projectId")
SELECT "id", (SELECT "id" FROM "Project" WHERE "slug" = 'tda27')
FROM "User"
WHERE "googleId" <> 'system'
ON CONFLICT ("userId", "projectId") DO NOTHING;

-- Legacy group memberships represented the old single-level assignment.
-- The project memberships above replace them; explicit group-wide access can be re-added later.
DELETE FROM "UserGroup"
WHERE "groupId" = (SELECT "id" FROM "Group" WHERE "slug" = 'tda');
