-- CreateEnum
CREATE TYPE "ProjectState" AS ENUM ('draft', 'active', 'archived');

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "state" "ProjectState" NOT NULL DEFAULT 'draft',
    "createIdempotencyKey" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_workspaceId_createIdempotencyKey_key" ON "Project"("workspaceId", "createIdempotencyKey");

-- CreateIndex
CREATE INDEX "Project_workspaceId_updatedAt_id_idx" ON "Project"("workspaceId", "updatedAt" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
