-- AlterTable
ALTER TABLE "UploadIntent"
ADD COLUMN "observedSizeBytes" BIGINT,
ADD COLUMN "observedContentType" VARCHAR(100),
ADD COLUMN "storageEtag" VARCHAR(255);
