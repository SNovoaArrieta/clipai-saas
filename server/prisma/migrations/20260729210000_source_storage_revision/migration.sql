-- AlterTable
ALTER TABLE "UploadIntent"
ADD COLUMN "storageRevision" VARCHAR(1024);

-- Existing completed Internal Alpha rows cannot be assigned an immutable
-- revision safely. NOT VALID preserves them while enforcing the invariant for
-- every new or updated row.
ALTER TABLE "UploadIntent"
ADD CONSTRAINT "UploadIntent_completed_requires_storage_revision"
CHECK ("completedAt" IS NULL OR "storageRevision" IS NOT NULL)
NOT VALID;
