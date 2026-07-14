-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('upload');

-- CreateEnum
CREATE TYPE "SourceState" AS ENUM ('submitted', 'validating', 'accepted', 'rejected');

-- CreateIndex
CREATE UNIQUE INDEX "Project_id_workspaceId_key" ON "Project"("id", "workspaceId");

-- CreateTable
CREATE TABLE "Source" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sourceType" "SourceType" NOT NULL DEFAULT 'upload',
    "state" "SourceState" NOT NULL DEFAULT 'submitted',
    "safeReference" VARCHAR(255) NOT NULL,
    "durationMs" BIGINT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadIntent" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "objectKey" VARCHAR(255) NOT NULL,
    "declaredContentType" VARCHAR(100) NOT NULL,
    "declaredSizeBytes" BIGINT NOT NULL,
    "originalFilename" VARCHAR(255) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createIdempotencyKey" VARCHAR(255) NOT NULL,

    CONSTRAINT "UploadIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_id_workspaceId_projectId_key" ON "Source"("id", "workspaceId", "projectId");

-- CreateIndex
CREATE INDEX "Source_workspaceId_projectId_idx" ON "Source"("workspaceId", "projectId");

-- CreateIndex
CREATE INDEX "Source_projectId_createdAt_id_idx" ON "Source"("projectId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UploadIntent_sourceId_key" ON "UploadIntent"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadIntent_sourceId_workspaceId_projectId_key" ON "UploadIntent"("sourceId", "workspaceId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadIntent_objectKey_key" ON "UploadIntent"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "UploadIntent_workspaceId_projectId_createIdempotencyKey_key" ON "UploadIntent"("workspaceId", "projectId", "createIdempotencyKey");

-- CreateIndex
CREATE INDEX "UploadIntent_workspaceId_projectId_idx" ON "UploadIntent"("workspaceId", "projectId");

-- CreateIndex
CREATE INDEX "UploadIntent_expiresAt_idx" ON "UploadIntent"("expiresAt");

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_projectId_workspaceId_fkey" FOREIGN KEY ("projectId", "workspaceId") REFERENCES "Project"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadIntent" ADD CONSTRAINT "UploadIntent_sourceId_workspaceId_projectId_fkey" FOREIGN KEY ("sourceId", "workspaceId", "projectId") REFERENCES "Source"("id", "workspaceId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
